import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../AuthContext'

function formatWallet(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return 'NPR ' + v.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

export default function FlightsHeader({ activeTab = 'flights' }) {
  const navigate = useNavigate()
  const { user, loading, logout } = useAuth()

  return (
    <header className="fd-header">
      <div className="fd-header-left">
        <span className="fd-logo" onClick={() => navigate('/')}>Binayak's Flights</span>
        <nav className="fd-header-nav">
          <button type="button" className={`fd-nav-link ${activeTab === 'flights' ? 'active' : ''}`} onClick={() => navigate('/flights')}>Flights</button>
          <button type="button" className={`fd-nav-link ${activeTab === 'home' ? 'active' : ''}`} onClick={() => navigate('/')}>Home</button>
        </nav>
      </div>
      <div className="fd-header-actions">
        {loading ? null : user ? (
          <>
            <button type="button" className="fd-wallet-pill" onClick={() => navigate('/wallet')} title="Open wallet">
              <span className="fd-wallet-label">Wallet</span>
              <span className="fd-wallet-balance">{formatWallet(user.wallet_balance)}</span>
            </button>
            <button type="button" className="fd-nav-btn" onClick={() => navigate('/bookings')}>My Bookings</button>
            <div className="fd-user-avatar" title={user.name}>{user.name?.charAt(0)?.toUpperCase()}</div>
            <button type="button" className="fd-nav-btn fd-logout" onClick={logout}>Logout</button>
          </>
        ) : (
          <button type="button" className="fd-nav-btn fd-signin" onClick={() => navigate('/auth')}>Sign In</button>
        )}
      </div>
    </header>
  )
}
