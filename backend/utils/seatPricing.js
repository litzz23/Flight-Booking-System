const pool = require("../db/pool");
const { roundMoney } = require("./walletLedger");

const BUSINESS_MULTIPLIER = 2.5;
const WINDOW_SURCHARGE = 0.15;
const AISLE_SURCHARGE = 0.08;
const FRONT_ROW_SURCHARGE = 0.2;
const REAR_ROW_DISCOUNT = -0.05;

function parseSeatNumberParts(seatNumber) {
  const value = String(seatNumber || "")
    .trim()
    .toUpperCase();
  const row = Number(value.replace(/[^0-9]/g, "")) || 0;
  const col = value.replace(/[0-9]/g, "");
  return { row, col };
}

function normalizeSeatClass(seatClass) {
  const raw = String(seatClass || "")
    .trim()
    .toLowerCase();
  if (raw === "business") return "business";
  return "economy";
}

function getSeatPriceFromBase({ basePrice, seatNumber, seatClass }) {
  const normalizedBase = Number(basePrice) || 0;
  const normalizedClass = normalizeSeatClass(seatClass);
  const { row, col } = parseSeatNumberParts(seatNumber);

  let workingBase = normalizedBase;
  const breakdownItems = [];

  if (normalizedClass === "business") {
    workingBase = workingBase * BUSINESS_MULTIPLIER;
    breakdownItems.push("Business class x2.5");
  }

  let adjustmentPct = 0;
  if (col === "A" || col === "F") {
    adjustmentPct += WINDOW_SURCHARGE;
    breakdownItems.push("Window +15%");
  } else if (col === "C" || col === "D") {
    adjustmentPct += AISLE_SURCHARGE;
    breakdownItems.push("Aisle +8%");
  } else if (col === "B" || col === "E") {
    breakdownItems.push("Middle +0%");
  }

  if (row >= 1 && row <= 2) {
    adjustmentPct += FRONT_ROW_SURCHARGE;
    breakdownItems.push("Front row +20%");
  } else if (row >= 11 && row <= 12) {
    adjustmentPct += REAR_ROW_DISCOUNT;
    breakdownItems.push("Rear row -5%");
  }

  if (breakdownItems.length === 0) {
    breakdownItems.push("Base fare");
  }

  const rawPrice = roundMoney(workingBase * (1 + adjustmentPct));
  const price = Math.max(roundMoney(normalizedBase), rawPrice);
  if (price > rawPrice) {
    breakdownItems.push("Minimum flight fare applied");
  }
  return {
    price,
    breakdownItems,
    breakdownText: breakdownItems.join(" + "),
  };
}

async function getSeatPrice(
  flightId,
  seatNumber,
  seatClass,
  clientOrPool = pool,
) {
  const result = await clientOrPool.query(
    "SELECT price FROM flights WHERE id = $1",
    [flightId],
  );
  if (result.rowCount === 0) {
    const err = new Error("Flight not found.");
    err.statusCode = 404;
    throw err;
  }

  return getSeatPriceFromBase({
    basePrice: result.rows[0].price,
    seatNumber,
    seatClass,
  });
}

module.exports = {
  getSeatPrice,
  getSeatPriceFromBase,
  normalizeSeatClass,
};
