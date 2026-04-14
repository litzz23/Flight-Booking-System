import { NavLink } from 'react-router-dom'

const items = [
  { to: '/dashboard', label: 'Dashboard', end: true },
  { to: '/dashboard/bookings', label: 'My Bookings' },
  { to: '/dashboard/wallet', label: 'Wallet' },
  { to: '/dashboard/profile', label: 'Profile' },
]

export default function DashboardSidebar() {
  return (
    <aside className="ud-side">
      <h2>User Panel</h2>
      <nav>
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `ud-side-link ${isActive ? 'active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
