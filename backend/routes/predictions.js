const router = require("express").Router();
const pool = require("../db/pool");
const {
  generateGroqPriceInsight,
  generateGroqRiskInsight,
} = require("../services/groqInsights");
const {
  getRegionRiskContribution,
  listRegionScoresForApi,
} = require("../constants/destinationRegionRisk");
const { listMonthRiskForApi } = require("../constants/seasonMonthRisk");

function normalizedCityExpr(valueSql) {
  return `REGEXP_REPLACE(LOWER(TRIM(${valueSql})), '(.)\\1+', '\\1', 'g')`;
}

function getNepalMonth(dateValue) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kathmandu",
    month: "numeric",
  }).formatToParts(new Date(dateValue));
  const monthPart = parts.find((p) => p.type === "month");
  return Number(monthPart?.value || 0);
}

function roundNpr25(n) {
  return Math.max(500, Math.round(Number(n) / 25) * 25);
}

function getDemandScore(flight, month) {
  const depMs = new Date(flight.departure_time).getTime();
  const hoursToDeparture = (depMs - Date.now()) / (1000 * 60 * 60);
  const total = Number(flight.total_seats || 0);
  const left = Number(flight.available_seats || 0);
  const occupancy = total > 0 ? Math.max(0, Math.min(1, 1 - left / total)) : 0.5;

  let score = Math.round(occupancy * 60);
  const factors = [];

  if (occupancy >= 0.85) factors.push("Most seats are already sold");
  else if (occupancy >= 0.6) factors.push("Seat inventory is tightening");
  else factors.push("Many seats are still available");

  if (hoursToDeparture <= 12) {
    score += 25;
    factors.push("Departure is within 12 hours");
  } else if (hoursToDeparture <= 24) {
    score += 18;
    factors.push("Departure is within 24 hours");
  } else if (hoursToDeparture <= 72) {
    score += 8;
    factors.push("Departure is within 3 days");
  }

  if (month >= 3 && month <= 5) {
    score += 12;
    factors.push("Peak spring travel season");
  } else if (month >= 6 && month <= 8) {
    score -= 8;
    factors.push("Monsoon season softens demand");
  } else if (month === 10 || month === 11) {
    score += 9;
    factors.push("Festival/autumn travel demand");
  } else if (month === 12 || month === 1) {
    score += 4;
    factors.push("Winter holiday traffic");
  }

  return { score: Math.max(0, Math.min(100, score)), factors };
}

function buildPriceHeuristic(flight) {
  const month = getNepalMonth(flight.departure_time);
  const basePrice = Number(flight.price || 0);
  const demand = getDemandScore(flight, month);

  let demandLevel = "low";
  let multiplier = 0.94;
  let advice = "Fares are relatively soft; booking now is usually favorable.";

  if (demand.score >= 70) {
    demandLevel = "high";
    multiplier = 1.12;
    advice = "Demand is high and fares may rise soon, so booking early is safer.";
  } else if (demand.score >= 40) {
    demandLevel = "medium";
    multiplier = 1.04;
    advice = "Demand is moderate; prices may fluctuate but usually trend slightly up.";
  }

  return {
    flight_id: Number(flight.id),
    current_price: roundNpr25(basePrice),
    predicted_price: roundNpr25(basePrice * multiplier),
    demand_level: demandLevel,
    advice,
    factors: demand.factors,
  };
}

function buildRiskHeuristic(flight, regionRaw) {
  const points = [];
  const factors = [];
  const dep = new Date(flight.departure_time);
  const hoursToDeparture = (dep.getTime() - Date.now()) / (1000 * 60 * 60);
  const month = getNepalMonth(flight.departure_time);
  const hour = dep.getHours();

  const region = getRegionRiskContribution(regionRaw);
  if (region.points > 0 && region.factor) {
    points.push(region.points);
    factors.push(region.factor);
  }
  if (month >= 6 && month <= 8) {
    points.push(20);
    factors.push("Monsoon season — elevated weather disruption risk");
  }
  if (month === 12 || month === 1) {
    points.push(15);
    factors.push("Winter fog window — possible visibility delays");
  }
  if (hour < 7) {
    points.push(8);
    factors.push("Very early departure can face morning visibility delays");
  } else if (hour >= 17) {
    points.push(5);
    factors.push("Evening departure can inherit network delay buildup");
  }
  if (hoursToDeparture <= 6) {
    points.push(10);
    factors.push("Short departure window leaves less schedule recovery time");
  }

  const score = points.reduce((sum, p) => sum + p, 0);
  const bounded = Math.max(0, Math.min(100, score));
  const color = bounded >= 45 ? "red" : bounded >= 20 ? "amber" : "green";
  return {
    flight_id: Number(flight.id),
    score: bounded,
    color,
    label: color === "red" ? "High risk" : color === "amber" ? "Moderate risk" : "Low risk",
    advice:
      color === "red"
        ? "Keep buffer time and monitor updates closely before departure."
        : color === "amber"
          ? "Plan with some flexibility in case of schedule adjustments."
          : "Current conditions suggest a relatively stable operation window.",
    factors:
      factors.length > 0
        ? factors
        : ["No major seasonal or regional disruption signals detected"],
  };
}

async function getFlightWithRegion(flightId) {
  const result = await pool.query(
    `SELECT
      f.*,
      d.region AS destination_region
     FROM flights f
     LEFT JOIN destinations d
       ON ${normalizedCityExpr("d.city")} = ${normalizedCityExpr("f.destination")}
     WHERE f.id = $1
     LIMIT 1`,
    [flightId],
  );
  return result.rows[0] || null;
}

router.get("/price/:flightId", async (req, res) => {
  try {
    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({
        error: "Groq is not configured. Set GROQ_API_KEY to use this endpoint.",
      });
    }
    const flight = await getFlightWithRegion(req.params.flightId);
    if (!flight) return res.status(404).json({ error: "Flight not found." });
    const heuristic = buildPriceHeuristic(flight);
    const groq = await generateGroqPriceInsight({ flight, heuristic });
    res.json(groq || heuristic);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/cancellation-risk/:flightId", async (req, res) => {
  try {
    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({
        error: "Groq is not configured. Set GROQ_API_KEY to use this endpoint.",
      });
    }
    const flight = await getFlightWithRegion(req.params.flightId);
    if (!flight) return res.status(404).json({ error: "Flight not found." });
    const heuristic = buildRiskHeuristic(flight, flight.destination_region);
    const groq = await generateGroqRiskInsight({ flight, heuristic });
    res.json(groq || heuristic);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/region-scores", (req, res) => {
  res.json({ regions: listRegionScoresForApi() });
});

router.get("/month-risk", (req, res) => {
  res.json(listMonthRiskForApi());
});

module.exports = router;
