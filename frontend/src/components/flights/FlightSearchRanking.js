/** Local ranking heuristic for "top flights" ordering. */
export function scoreFlight(f, ctx) {
  const {
    minPrice,
    maxPrice,
    minDur,
    maxDur,
    getDurationMin,
  } = ctx;
  const p = Number(f.price);
  const dur = getDurationMin(f.departure_time, f.arrival_time);
  const pSpread = maxPrice - minPrice || 1;
  const dSpread = maxDur - minDur || 1;
  const priceScore = 1 - (p - minPrice) / pSpread;
  const durScore = 1 - (dur - minDur) / dSpread;
  const dep = new Date(f.departure_time);
  const hour = dep.getHours() + dep.getMinutes() / 60;
  const ideal = 9;
  const depScore = 1 - Math.min(Math.abs(hour - ideal), 8) / 8;
  const disc = (Number(f.discount) || 0) / 60;
  return priceScore * 0.42 + durScore * 0.22 + depScore * 0.18 + disc * 0.18;
}

export function pickTopDeparting(flights, getDurationMin, limit = 4) {
  if (!flights.length) return [];
  const prices = flights.map((f) => Number(f.price));
  const durs = flights.map((f) =>
    getDurationMin(f.departure_time, f.arrival_time)
  );
  const ctx = {
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    minDur: Math.min(...durs),
    maxDur: Math.max(...durs),
    getDurationMin,
  };
  const scored = flights.map((f) => ({
    f,
    s: scoreFlight(f, ctx),
  }));
  scored.sort((a, b) => b.s - a.s);
  const seen = new Set();
  const out = [];
  for (const { f } of scored) {
    const k = f.id;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
    if (out.length >= limit) break;
  }
  return out;
}

export function buildPriceInsights(priceByDate, dateKeys) {
  const entries = dateKeys
    .map((k) => [k, priceByDate[k]])
    .filter(([, v]) => v != null);
  if (entries.length === 0) return [];
  const sorted = [...entries].sort((a, b) => a[1] - b[1]);
  const [cheapestDay, cheapestP] = sorted[0];
  const [, highestP] = sorted[sorted.length - 1];
  const d = new Date(cheapestDay + "T12:00:00");
  const label = d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const lines = [
    `Lowest fare in this window: ${label} · NPR ${Math.round(cheapestP).toLocaleString()}`,
  ];
  if (sorted.length > 1 && highestP > cheapestP * 1.08) {
    lines.push(
      `Prices vary by about ${Math.round(((highestP - cheapestP) / cheapestP) * 100)}% across dates — pick a day in the grid to filter.`
    );
  }
  return lines;
}
