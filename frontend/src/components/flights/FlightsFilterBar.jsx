import { CABIN_CLASSES } from "../../flightConstants";

export default function FlightsFilterBar({
  onAllFilters,
  hasActiveFilters,
  passengerFilter,
  setPassengerFilter,
  classFilter,
  setClassFilter,
  airlineFilter,
  setAirlineFilter,
  maxPrice,
  setMaxPrice,
  maxDuration,
  setMaxDuration,
  activeDropdown,
  setActiveDropdown,
  meta,
}) {
  return (
    <div className="fd-filter-bar">
      <div className="fd-filter-bar-inner">
        <button
          type="button"
          className={`fd-filter-chip fd-filter-all ${hasActiveFilters ? "has-filters" : ""}`}
          onClick={onAllFilters}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
          </svg>
          All filters
          {hasActiveFilters && <span className="fd-filter-count">•</span>}
        </button>

        <div className="fd-filter-wrapper" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`fd-filter-chip ${passengerFilter > 1 ? "active" : ""}`}
            onClick={() =>
              setActiveDropdown(activeDropdown === "pax" ? null : "pax")
            }
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
            {passengerFilter}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 10l5 5 5-5z" />
            </svg>
          </button>
          {activeDropdown === "pax" && (
            <div className="fd-dropdown">
              {[1, 2, 3, 4, 5].map((n) => (
                <div
                  key={n}
                  className={`fd-dropdown-item ${n === passengerFilter ? "selected" : ""}`}
                  onClick={() => {
                    setPassengerFilter(n);
                    setActiveDropdown(null);
                  }}
                >
                  {n} {n === 1 ? "passenger" : "passengers"}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="fd-filter-wrapper" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`fd-filter-chip ${classFilter !== "Economy" ? "active" : ""}`}
            onClick={() =>
              setActiveDropdown(activeDropdown === "class" ? null : "class")
            }
          >
            {classFilter}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 10l5 5 5-5z" />
            </svg>
          </button>
          {activeDropdown === "class" && (
            <div className="fd-dropdown">
              {CABIN_CLASSES.map((c) => (
                <div
                  key={c}
                  className={`fd-dropdown-item ${c === classFilter ? "selected" : ""}`}
                  onClick={() => {
                    setClassFilter(c);
                    setActiveDropdown(null);
                  }}
                >
                  {c}
                </div>
              ))}
            </div>
          )}
        </div>

        {meta.airlines?.length > 0 && (
          <div
            className="fd-filter-wrapper"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={`fd-filter-chip ${airlineFilter !== "All" ? "active" : ""}`}
              onClick={() =>
                setActiveDropdown(
                  activeDropdown === "airline" ? null : "airline",
                )
              }
            >
              Airlines
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M7 10l5 5 5-5z" />
              </svg>
            </button>
            {activeDropdown === "airline" && (
              <div className="fd-dropdown">
                <div
                  className={`fd-dropdown-item ${airlineFilter === "All" ? "selected" : ""}`}
                  onClick={() => {
                    setAirlineFilter("All");
                    setActiveDropdown(null);
                  }}
                >
                  All airlines
                </div>
                {meta.airlines.map((a) => (
                  <div
                    key={a}
                    className={`fd-dropdown-item ${a === airlineFilter ? "selected" : ""}`}
                    onClick={() => {
                      setAirlineFilter(a);
                      setActiveDropdown(null);
                    }}
                  >
                    {a}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="fd-filter-wrapper" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`fd-filter-chip ${maxPrice < 100000 ? "active" : ""}`}
            onClick={() =>
              setActiveDropdown(activeDropdown === "price" ? null : "price")
            }
          >
            Price
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 10l5 5 5-5z" />
            </svg>
          </button>
          {activeDropdown === "price" && (
            <div className="fd-dropdown fd-dropdown-slider">
              <label className="fd-slider-label">
                Max price: NPR {maxPrice.toLocaleString()}
              </label>
              <input
                type="range"
                min="1000"
                max="100000"
                step="500"
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="fd-range-input"
              />
              <div className="fd-range-ends">
                <span>NPR 1,000</span>
                <span>NPR 100,000</span>
              </div>
            </div>
          )}
        </div>

        <div className="fd-filter-wrapper" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`fd-filter-chip ${maxDuration < 480 ? "active" : ""}`}
            onClick={() =>
              setActiveDropdown(activeDropdown === "dur" ? null : "dur")
            }
          >
            Duration
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 10l5 5 5-5z" />
            </svg>
          </button>
          {activeDropdown === "dur" && (
            <div className="fd-dropdown fd-dropdown-slider">
              <label className="fd-slider-label">
                Max duration:{" "}
                {maxDuration >= 60
                  ? `${Math.floor(maxDuration / 60)}h ${maxDuration % 60}m`
                  : `${maxDuration}m`}
              </label>
              <input
                type="range"
                min="15"
                max="480"
                step="5"
                value={maxDuration}
                onChange={(e) => setMaxDuration(Number(e.target.value))}
                className="fd-range-input"
              />
              <div className="fd-range-ends">
                <span>15m</span>
                <span>8h</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
