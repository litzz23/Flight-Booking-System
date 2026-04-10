function getGroqModelName() {
  return String(process.env.GROQ_MODEL || "llama-3.1-8b-instant").trim();
}

const GROQ_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 2 * 60 * 1000;
const priceCache = new Map();
const riskCache = new Map();

function parseJsonFromText(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {}

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {}
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch {}
  }

  return null;
}

function extractNumber(text, regex) {
  const m = String(text || "").match(regex);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function extractDemandLevelFromText(text) {
  const s = String(text || "").toLowerCase();
  if (s.includes("demand_level") || s.includes("demand level")) {
    if (s.includes("high")) return "high";
    if (s.includes("medium")) return "medium";
    if (s.includes("low")) return "low";
  }
  return null;
}

function extractColorFromText(text) {
  const s = String(text || "").toLowerCase();
  if (s.includes("color") || s.includes("risk")) {
    if (s.includes("amber")) return "amber";
    if (s.includes("red")) return "red";
    if (s.includes("green")) return "green";
  }
  return null;
}

function roundNpr25(n) {
  return Math.max(500, Math.round(Number(n) / 25) * 25);
}

async function callGroq(prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: getGroqModelName(),
        temperature: 0.2,
        response_format: { type: "json_object" },
        max_tokens: 220,
        messages: [
          { role: "system", content: "Return strict JSON only. No markdown." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("Groq API error:", response.status, errText.slice(0, 300));
      return null;
    }
    const json = await response.json();
    const text = json?.choices?.[0]?.message?.content || "";
    const parsed = parseJsonFromText(text);
    return parsed || { _raw_text: text };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function getCached(map, key) {
  const row = map.get(key);
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    map.delete(key);
    return null;
  }
  return row.value;
}

function setCached(map, key, value) {
  map.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function cleanFactors(input, fallback) {
  if (!Array.isArray(input)) return fallback;
  const values = input
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .slice(0, 5);
  return values.length > 0 ? values : fallback;
}

function toDemandLevel(value, fallback = "low") {
  const v = String(value || "").trim().toLowerCase();
  if (v === "low" || v === "medium" || v === "high") return v;
  return fallback;
}

function toRiskColor(value, fallback = "green") {
  const v = String(value || "").trim().toLowerCase();
  if (v === "green" || v === "amber" || v === "red") return v;
  return fallback;
}

async function generateGroqPriceInsight({ flight, heuristic }) {
  const cacheKey = String(flight.id);
  const cached = getCached(priceCache, cacheKey);
  if (cached) return cached;

  const prompt = `
Return only JSON with keys:
predicted_price(number), demand_level(low|medium|high), advice(string), factors(string[] <= 5)
Flight: ${JSON.stringify({
  id: Number(flight.id),
  origin: flight.origin,
  destination: flight.destination,
  departure_time: flight.departure_time,
  price: Number(flight.price),
  total_seats: Number(flight.total_seats),
  available_seats: Number(flight.available_seats),
  status: flight.status,
  destination_region: flight.destination_region || null,
})}
Baseline heuristic: ${JSON.stringify(heuristic || null)}
`;

  const ai = await callGroq(prompt);
  if (!ai || typeof ai !== "object") return null;

  const currentPrice = roundNpr25(Number(flight.price || 0));
  const predictedRaw =
    Number(ai.predicted_price) ||
    extractNumber(ai._raw_text, /predicted[_\s-]*price[^0-9]*([0-9]+(?:\.[0-9]+)?)/i);
  const demandFromRaw = extractDemandLevelFromText(ai._raw_text);
  const adviceFromRaw =
    String(ai._raw_text || "")
      .split(/\n+/)
      .map((v) => v.trim())
      .find(Boolean) || "";

  const result = {
    flight_id: Number(flight.id),
    current_price: Number(heuristic?.current_price) || currentPrice,
    predicted_price: Number.isFinite(predictedRaw)
      ? roundNpr25(predictedRaw)
      : Number(heuristic?.predicted_price) || currentPrice,
    demand_level: toDemandLevel(
      ai.demand_level || demandFromRaw,
      heuristic?.demand_level || "low",
    ),
    advice:
      String(ai.advice || adviceFromRaw).trim() ||
      heuristic?.advice ||
      "Price insight unavailable from model output.",
    factors: cleanFactors(
      ai.factors,
      heuristic?.factors || ["Model returned limited signal details"],
    ),
  };
  setCached(priceCache, cacheKey, result);
  return result;
}

async function generateGroqRiskInsight({ flight, heuristic }) {
  const cacheKey = String(flight.id);
  const cached = getCached(riskCache, cacheKey);
  if (cached) return cached;

  const prompt = `
Return only JSON with keys:
score(number 0..100), color(green|amber|red), label(string), advice(string), factors(string[] <= 5)
Flight: ${JSON.stringify({
  id: Number(flight.id),
  origin: flight.origin,
  destination: flight.destination,
  departure_time: flight.departure_time,
  status: flight.status,
  destination_region: flight.destination_region || null,
})}
Baseline heuristic: ${JSON.stringify(heuristic || null)}
`;

  const ai = await callGroq(prompt);
  if (!ai || typeof ai !== "object") return null;

  const rawScore =
    Number(ai.score) ||
    extractNumber(ai._raw_text, /score[^0-9]*([0-9]+(?:\.[0-9]+)?)/i);
  const score = Number.isFinite(rawScore)
    ? Math.max(0, Math.min(100, Math.round(rawScore)))
    : Number(heuristic?.score) || 0;
  const color = toRiskColor(
    ai.color || extractColorFromText(ai._raw_text),
    heuristic?.color || "green",
  );
  const adviceFromRaw =
    String(ai._raw_text || "")
      .split(/\n+/)
      .map((v) => v.trim())
      .find(Boolean) || "";

  const result = {
    flight_id: Number(flight.id),
    score,
    color,
    label:
      String(ai.label || "").trim() ||
      heuristic?.label ||
      (color === "red"
        ? "High risk"
        : color === "amber"
          ? "Moderate risk"
          : "Low risk"),
    advice:
      String(ai.advice || adviceFromRaw).trim() ||
      heuristic?.advice ||
      "Risk insight unavailable from model output.",
    factors: cleanFactors(
      ai.factors,
      heuristic?.factors || ["Model returned limited risk factors"],
    ),
  };
  setCached(riskCache, cacheKey, result);
  return result;
}

module.exports = { generateGroqPriceInsight, generateGroqRiskInsight };
