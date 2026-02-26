export function buildLocalDateKeys(numDays) {
  const out = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  for (let i = 0; i < numDays; i++) {
    const x = new Date(d);
    x.setDate(x.getDate() + i);
    out.push(`${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`);
  }
  return out;
}

export function minPriceByDate(flights, origin, destination) {
  const map = {};
  const o = origin.toLowerCase();
  const dest = destination.toLowerCase();
  for (const f of flights) {
    if (f.origin.toLowerCase() !== o) continue;
    if (f.destination.toLowerCase() !== dest) continue;
    const day = f.departure_time.slice(0, 10);
    const p = Number(f.price);
    if (map[day] == null || p < map[day]) map[day] = p;
  }
  return map;
}

/** Date key with lowest price in the set (for cheapest-day highlight) */
export function findCheapestDateKey(priceByDate, dateKeys) {
  let bestK = null;
  let bestP = Infinity;
  for (const k of dateKeys) {
    const p = priceByDate[k];
    if (p != null && p < bestP) {
      bestP = p;
      bestK = k;
    }
  }
  return bestK;
}

export function RouteDateGrid({
  dateKeys,
  priceByDate,
  selectedDate,
  onSelectDate,
  formatShortPrice,
  cheapestDateKey,
}) {
  let prevMonth = null;
  return (
    <div className="gf-date-strip-wrap">
      <div className="gf-date-strip-head">
        <span className="gf-date-strip-title">Dates</span>
        <span className="gf-date-strip-hint">Lowest price highlighted</span>
      </div>
      <div className="gf-date-grid-scroll">
        <div className="gf-date-grid">
          {dateKeys.map((key) => {
            const price = priceByDate[key];
            const active = selectedDate === key;
            const isLowest = cheapestDateKey && key === cheapestDateKey && price != null;
            const d = new Date(key + "T12:00:00");
            const wd = d.toLocaleDateString("en-US", { weekday: "short" });
            const dayNum = d.getDate();
            const mon = d.toLocaleDateString("en-US", { month: "short" });
            const showMon = mon !== prevMonth;
            prevMonth = mon;
            return (
              <button
                key={key}
                type="button"
                className={`gf-date-cell ${active ? "active" : ""} ${price == null ? "empty" : ""} ${isLowest ? "lowest" : ""}`}
                onClick={() => onSelectDate(active ? null : key)}
              >
                {showMon && <span className="gf-date-month">{mon}</span>}
                <span className="gf-date-wd">{wd}</span>
                <span className="gf-date-num">{dayNum}</span>
                <span className="gf-date-price">
                  {price != null ? formatShortPrice(price) : "—"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
