import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { adminDestinationsApi, adminFlightsApi } from "../../services/adminApi";
import DataTable from "../../components/admin/DataTable";
import DashboardTableControls from "../../components/admin/DashboardTableControls";
import FormModal from "../../components/admin/FormModal";
import { useDashboardTable } from "../../hooks/useDashboardTable";
import {
  uniqueDateDayFilter,
  uniqueValueFilter,
} from "../../utils/dashboardColumnFilters";

const FLIGHT_TOTAL_SEATS = 72;

const FLIGHTS_SORT = {
  flightName: (r) => (r.flightName || "").toLowerCase(),
  from: (r) => (r.from || "").toLowerCase(),
  to: (r) => (r.to || "").toLowerCase(),
  departureTime: (r) => new Date(r.departureTime).getTime(),
  arrivalTime: (r) => new Date(r.arrivalTime).getTime(),
  price: (r) => Number(r.price) || 0,
  status: (r) => (r.status || "").toLowerCase(),
};

const emptyFlight = {
  airline: "Binayak Airlines",
  flight_number: "",
  from: "",
  to: "",
  departureTime: "",
  arrivalTime: "",
  price: "",
  original_price: "",
  status: "scheduled",
};

const getErrorMessage = (err, fallback) =>
  err.response?.data?.error || err.message || fallback;

export default function AdminFlightsPage() {
  const [flights, setFlights] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyFlight);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [flightsData, destinationsData] = await Promise.all([
        adminFlightsApi.getAll(),
        adminDestinationsApi.getAll(),
      ]);
      setFlights(flightsData);
      setDestinations(destinationsData);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load flights."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyFlight);
    setOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      airline: row.airline || "Binayak Airlines",
      flight_number: row.flight_number || "",
      from: row.from || "",
      to: row.to || "",
      departureTime: row.departureTime
        ? new Date(row.departureTime).toISOString().slice(0, 16)
        : "",
      arrivalTime: row.arrivalTime
        ? new Date(row.arrivalTime).toISOString().slice(0, 16)
        : "",
      price: row.price || "",
      original_price: row.original_price || "",
      status: row.status || "scheduled",
    });
    setOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      airline: form.airline.trim(),
      flight_number: form.flight_number.trim(),
      from: form.from,
      to: form.to,
      departureTime: form.departureTime,
      arrivalTime: form.arrivalTime,
      price: Number(form.price),
      original_price:
        form.original_price === "" ? null : Number(form.original_price),
      total_seats: FLIGHT_TOTAL_SEATS,
      status: form.status,
    };
    try {
      if (editing) {
        await adminFlightsApi.update(editing.id, payload);
        toast.success("Flight updated.");
      } else {
        await adminFlightsApi.create(payload);
        toast.success("Flight created.");
      }
      setOpen(false);
      await load();
    } catch (err) {
      const msg = getErrorMessage(err, "Failed to save flight.");
      setError(msg);
      toast.error(msg);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this flight?")) {
      return;
    }
    try {
      await adminFlightsApi.delete(id);
      toast.success("Flight deleted.");
      await load();
    } catch (err) {
      const msg = getErrorMessage(err, "Failed to delete flight.");
      setError(msg);
      toast.error(msg);
    }
  };

  const cityOptions = destinations.map((d) => d.city);
  const toOptions = cityOptions.filter((city) => city !== form.from);

  const flightsTableConfig = useMemo(
    () => ({
      getSearchText: (r) =>
        [
          r.flightName,
          r.from,
          r.to,
          r.airline,
          r.flight_number,
          r.status,
          r.departureTime && new Date(r.departureTime).toLocaleString(),
        ]
          .filter(Boolean)
          .join(" "),
      filters: [
        uniqueValueFilter("flightName", "Flight", flights, (r) => r.flightName),
        uniqueValueFilter("from", "From", flights, (r) => r.from),
        uniqueValueFilter("to", "To", flights, (r) => r.to),
        uniqueValueFilter(
          "price",
          "Price (NPR)",
          flights,
          (r) => String(Number(r.price)),
          { maxOptions: 60 },
        ),
        uniqueDateDayFilter(
          "depDay",
          "Departure (day)",
          flights,
          (r) => new Date(r.departureTime).getTime(),
          { maxOptions: 60 },
        ),
        uniqueDateDayFilter(
          "arrDay",
          "Arrival (day)",
          flights,
          (r) => new Date(r.arrivalTime).getTime(),
          { maxOptions: 60 },
        ),
        {
          field: "status",
          label: "Status",
          allValue: "",
          match: (row, v) => String(row.status || "") === v,
          options: [
            { value: "", label: "All statuses" },
            { value: "scheduled", label: "Scheduled" },
            { value: "delayed", label: "Delayed" },
            { value: "cancelled", label: "Cancelled" },
            { value: "completed", label: "Completed" },
          ],
        },
      ].filter(Boolean),
      sortAccessors: FLIGHTS_SORT,
      defaultSort: { key: "departureTime", dir: "asc" },
      initialPageSize: 10,
    }),
    [flights],
  );

  const table = useDashboardTable(flights, flightsTableConfig);

  const flightColumns = useMemo(
    () => [
      { key: "flightName", label: "Flight", sortable: true },
      { key: "from", label: "From", sortable: true },
      { key: "to", label: "To", sortable: true },
      {
        key: "departureTime",
        label: "Departure",
        sortable: true,
        render: (r) => new Date(r.departureTime).toLocaleString(),
      },
      {
        key: "arrivalTime",
        label: "Arrival",
        sortable: true,
        render: (r) => new Date(r.arrivalTime).toLocaleString(),
      },
      {
        key: "price",
        label: "Price",
        sortable: true,
        render: (r) => `NPR ${Number(r.price).toLocaleString()}`,
      },
      { key: "status", label: "Status", sortable: true },
    ],
    [],
  );

  const flightsEmptyMessage =
    table.totalAll === 0
      ? "No flights yet."
      : "No rows match your search or filters.";

  const autoDiscount = useMemo(() => {
    const priceNum = Number(form.price);
    const originalNum =
      form.original_price === "" ? priceNum : Number(form.original_price);
    if (
      !Number.isFinite(priceNum) ||
      !Number.isFinite(originalNum) ||
      originalNum <= 0
    )
      return 0;
    const computed = Math.round((1 - priceNum / originalNum) * 100);
    return Math.max(0, Math.min(100, computed));
  }, [form.price, form.original_price]);

  return (
    <>
      <div className="ad-row-between">
        <header className="ad-title-row">
          <h1>Flight Management</h1>
          <p>Create, update, and delete flights.</p>
        </header>
        <button type="button" className="ad-btn primary" onClick={openCreate}>
          Add Flight
        </button>
      </div>
      {error ? <p className="ad-error">{error}</p> : null}
      {loading ? (
        <p className="ad-empty">Loading flights...</p>
      ) : (
        <section className="ad-panel">
          <DashboardTableControls
            variant="admin"
            search={table.search}
            onSearchChange={table.setSearch}
            searchPlaceholder="Search route, flight, airline, status…"
            filters={flightsTableConfig.filters}
            filterState={table.filterState}
            onFilterChange={table.setFilter}
            pageSize={table.pageSize}
            onPageSizeChange={table.setPageSize}
            page={table.page}
            totalPages={table.totalPages}
            onPageChange={table.setPage}
            rangeStart={table.rangeStart}
            rangeEnd={table.rangeEnd}
            totalFiltered={table.totalFiltered}
          />
          <DataTable
            columns={flightColumns}
            rows={table.paginatedRows}
            sortKey={table.sortKey}
            sortDir={table.sortDir}
            onSortColumn={table.toggleSort}
            emptyMessage={flightsEmptyMessage}
            renderActions={(row) => (
              <>
                <button
                  type="button"
                  className="ad-btn"
                  onClick={() => openEdit(row)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="ad-btn danger"
                  onClick={() => handleDelete(row.id)}
                >
                  Delete
                </button>
              </>
            )}
          />
        </section>
      )}
      <FormModal
        title={editing ? "Edit Flight" : "Add Flight"}
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={handleSubmit}
        submitLabel={editing ? "Update Flight" : "Create Flight"}
      >
        <div className="ad-form-grid">
          <div className="ad-field">
            <label>Airline</label>
            <input
              type="text"
              value={form.airline}
              onChange={(e) =>
                setForm((p) => ({ ...p, airline: e.target.value }))
              }
              required
            />
          </div>
          <div className="ad-field">
            <label>Flight Number</label>
            <input
              type="text"
              value={form.flight_number}
              onChange={(e) =>
                setForm((p) => ({ ...p, flight_number: e.target.value }))
              }
              required
            />
          </div>
          <div className="ad-field">
            <label>From</label>
            <select
              value={form.from}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  from: e.target.value,
                  to: p.to === e.target.value ? "" : p.to,
                }))
              }
              required
            >
              <option value="">Select city</option>
              {cityOptions.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>
          <div className="ad-field">
            <label>To</label>
            <select
              value={form.to}
              onChange={(e) => setForm((p) => ({ ...p, to: e.target.value }))}
              required
            >
              <option value="">Select city</option>
              {toOptions.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>
          <div className="ad-field">
            <label>Departure Time</label>
            <input
              type="datetime-local"
              value={form.departureTime}
              onChange={(e) =>
                setForm((p) => ({ ...p, departureTime: e.target.value }))
              }
              required
            />
          </div>
          <div className="ad-field">
            <label>Arrival Time</label>
            <input
              type="datetime-local"
              value={form.arrivalTime}
              onChange={(e) =>
                setForm((p) => ({ ...p, arrivalTime: e.target.value }))
              }
              required
            />
          </div>
          <div className="ad-field">
            <label>Price / NPR</label>
            <input
              type="number"
              value={form.price}
              onChange={(e) =>
                setForm((p) => ({ ...p, price: e.target.value }))
              }
              required
            />
          </div>
          <div className="ad-field">
            <label>Original Price / NPR</label>
            <input
              type="number"
              value={form.original_price}
              onChange={(e) =>
                setForm((p) => ({ ...p, original_price: e.target.value }))
              }
            />
          </div>
          <div className="ad-field">
            <label>Discount % (Auto)</label>
            <input type="number" value={autoDiscount} disabled readOnly />
          </div>
          <div className="ad-field">
            <label>Status</label>
            <select
              value={form.status}
              onChange={(e) =>
                setForm((p) => ({ ...p, status: e.target.value }))
              }
            >
              <option value="scheduled">scheduled</option>
              <option value="delayed">delayed</option>
              <option value="cancelled">cancelled</option>
              <option value="completed">completed</option>
            </select>
          </div>
        </div>
      </FormModal>
    </>
  );
}
