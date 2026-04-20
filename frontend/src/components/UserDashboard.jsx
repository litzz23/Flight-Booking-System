import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import FlightsHeader from './flights/FlightsHeader'
import DashboardSidebar from './dashboard/DashboardSidebar'
import StatCard from './dashboard/StatCard'
import BookingsTable from './dashboard/BookingsTable'
import UpcomingFlights from './dashboard/UpcomingFlights'
import WalletPanel from './dashboard/WalletPanel'
import {
  getDashboardStats,
  getUserBookings,
  cancelUserBooking,
  getWallet,
  getTransactions,
  changePassword,
} from '../services/userDashboardApi'
import cloudsBg from '../assets/clouds-bg.png'
import './FlightDeals.css'
import './UserDashboard.css'

function money(v) {
  return 'NPR ' + Number(v || 0).toLocaleString()
}

export default function UserDashboard() {
  const navigate = useNavigate()
  const { user, refreshUser } = useAuth()
  const [active, setActive] = useState('overview')
  const [stats, setStats] = useState(null)
  const [bookings, setBookings] = useState([])
  const [wallet, setWallet] = useState({ balance: 0 })
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [s, b, w, t] = await Promise.all([
        getDashboardStats(),
        getUserBookings(),
        getWallet(),
        getTransactions(),
      ])
      setStats(s)
      setBookings(b)
      setWallet(w)
      setTransactions(t)
      await refreshUser()
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load dashboard.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const upcoming = useMemo(
    () => bookings.filter((b) => new Date(b.departure_time) >= new Date()),
    [bookings]
  )

  const handleCancel = async (id) => {
    try {
      await cancelUserBooking(id)
      await load()
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Unable to cancel booking.')
    }
  }

  const handleView = (id) => {
    navigate('/bookings', { state: { highlightBookingId: id } })
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    setPasswordMessage('')
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setPasswordMessage('Please fill all password fields.')
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage('New passwords do not match.')
      return
    }
    try {
      setPasswordLoading(true)
      const res = await changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      })
      setPasswordMessage(res.message || 'Password changed successfully.')
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      setPasswordMessage(err.response?.data?.error || err.message || 'Failed to change password.')
    } finally {
      setPasswordLoading(false)
    }
  }

  return (
    <div className="ud-page fd-page" style={{ backgroundImage: `url(${cloudsBg})` }}>
      <FlightsHeader />
      <main className="ud-layout">
        <DashboardSidebar active={active} onSelect={setActive} />
        <section className="ud-content">
          <header className="ud-title-row">
            <h1>User Dashboard</h1>
            <p>Welcome back, {user?.name}</p>
          </header>

          {error ? <p className="ud-error">{error}</p> : null}
          {loading ? <p className="ud-empty">Loading dashboard...</p> : null}

          {!loading && (
            <>
              {(active === 'overview' || active === 'bookings' || active === 'wallet' || active === 'profile') && (
                <section className="ud-stats-grid">
                  <StatCard icon="✈" title="Total Bookings" value={stats?.totalBookings ?? 0} />
                  <StatCard icon="🕒" title="Upcoming Flights" value={stats?.upcomingFlights ?? 0} />
                  <StatCard icon="💳" title="Wallet Balance" value={money(wallet.balance)} />
                  <StatCard icon="💰" title="Total Spent" value={money(stats?.totalSpent)} />
                </section>
              )}

              {(active === 'overview' || active === 'bookings') && (
                <section className="ud-panel">
                  <h3>My Bookings</h3>
                  <BookingsTable bookings={bookings} onCancel={handleCancel} onView={handleView} />
                </section>
              )}

              {(active === 'overview' || active === 'bookings') && (
                <section className="ud-panel">
                  <h3>Upcoming Flights</h3>
                  <UpcomingFlights flights={upcoming} />
                </section>
              )}

              {(active === 'overview' || active === 'wallet') && (
                <WalletPanel
                  balance={wallet.balance}
                  transactionsCount={transactions.length}
                  transactions={transactions}
                  onOpenWallet={() => navigate('/wallet')}
                />
              )}

              {(active === 'overview' || active === 'profile') && (
                <section className="ud-panel">
                  <h3>User Profile</h3>
                  <div className="ud-profile-grid">
                    <article>
                      <span>Name</span>
                      <p>{user?.name}</p>
                    </article>
                    <article>
                      <span>Email</span>
                      <p>{user?.email}</p>
                    </article>
                  </div>
                  <form className="ud-password-form" onSubmit={handlePasswordChange}>
                    <h4>Change Password</h4>
                    <input
                      type="password"
                      placeholder="Current password"
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))}
                    />
                    <input
                      type="password"
                      placeholder="New password"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))}
                    />
                    <input
                      type="password"
                      placeholder="Confirm new password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                    />
                    <button type="submit" className="ud-btn" disabled={passwordLoading}>
                      {passwordLoading ? 'Updating...' : 'Update Password'}
                    </button>
                    {passwordMessage ? <p className="ud-password-msg">{passwordMessage}</p> : null}
                  </form>
                </section>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  )
}
