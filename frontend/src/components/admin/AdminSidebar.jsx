import { NavLink } from "react-router-dom";

const items = [
  { to: "/admin", label: "Dashboard", end: true },
  { to: "/admin/destinations", label: "Destinations" },
  { to: "/admin/flights", label: "Flights" },
  { to: "/admin/bookings", label: "Bookings" },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/alerts", label: "Alerts" },
];

export default function AdminSidebar() {
  return (
    <aside className="ad-side">
      <h2>Admin Panel</h2>
      <nav>
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `ad-side-link ${isActive ? "active" : ""}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
