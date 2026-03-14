import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { wallet as walletAPI } from '../api'
import FlightsHeader from './flights/FlightsHeader'
import cloudsBg from '../assets/clouds-bg.png'
import './FlightDeals.css'
import './WalletPage.css'

const PRESETS = [1000, 2500, 5000, 10000, 25000]

function formatNpr(n) {
  return 'NPR ' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function txIcon(type) {
  switch (type) {
    case 'top_up':
      return (
        <svg className="w-tx-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 2v20M7 7l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'booking_payment':
      return (
        <svg className="w-tx-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" fill="currentColor" />
        </svg>
      )
    case 'refund':
      return (
        <svg className="w-tx-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 12a9 9 0 1018 0 9 9 0 00-18 0z" stroke="currentColor" strokeWidth="2" />
          <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    default:
      return (
        <svg className="w-tx-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        </svg>
      )
  }
}

function formatTxDate(iso) {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function WalletPage() {
  const navigate = useNavigate()
  const { user, refreshUser } = useAuth()
  const [balance, setBalance] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [amountStr, setAmountStr] = useState('')
  const [selectedPreset, setSelectedPreset] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [modalError, setModalError] = useState('')

  const load = useCallback(async () => {
    setLoadError('')
    try {
      const data = await walletAPI.get()
      setBalance(data.balance)
      setTransactions(data.transactions || [])
      await refreshUser()
    } catch (e) {
      setLoadError(e.message || 'Could not load wallet.')
    } finally {
      setLoading(false)
    }
  }, [refreshUser])

  useEffect(() => {
    if (!user) {
      navigate('/auth', { state: { from: '/wallet' } })
      return
    }
    load()
  }, [user, navigate, load])

  const openModal = () => {
    setModalOpen(true)
    setAmountStr('')
    setSelectedPreset(null)
    setModalError('')
  }

  const applyPreset = (n) => {
    setSelectedPreset(n)
    setAmountStr(String(n))
  }

  const handleAddFunds = async (e) => {
    e.preventDefault()
    const amount = parseFloat(amountStr)
    if (!Number.isFinite(amount) || amount <= 0) {
      setModalError('Enter a valid amount.')
      return
    }
    setSubmitting(true)
    setModalError('')
    try {
      await walletAPI.addFunds(amount)
      setModalOpen(false)
      setLoading(true)
      await load()
    } catch (err) {
      setModalError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!user) return null

  return (
    <div className="w-page" style={{ backgroundImage: `url(${cloudsBg})` }}>
      <FlightsHeader />
      <div className="w-hero-strip">
        <button type="button" className="w-back" onClick={() => navigate(-1)} aria-label="Go back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="w-hero-strip-text">
          <h1 className="w-title">Wallet</h1>
          <p className="w-sub">Add funds securely. Bookings debit here; cancellations credit back.</p>
        </div>
      </div>

      <main className="w-main">
        <section className="w-hero-card">
          <div className="w-hero-shine" aria-hidden />
          <div className="w-hero-inner">
            <p className="w-balance-label">Wallet balance</p>
            {loading && balance === null ? (
              <p className="w-balance-num w-skeleton">······</p>
            ) : (
              <p className="w-balance-num">{formatNpr(balance ?? user.wallet_balance ?? 0)}</p>
            )}
            <p className="w-balance-note">Bookings are paid from your balance. Refunds from cancellations return here.</p>
            <div className="w-hero-actions">
              <button type="button" className="w-btn-primary" onClick={openModal}>
                Add funds
              </button>
              <button type="button" className="w-btn-secondary" onClick={() => navigate('/flights')}>
                Book a flight
              </button>
            </div>
          </div>
        </section>

        {loadError && <div className="w-banner-error">{loadError}</div>}

        <section className="w-activity">
          <h2 className="w-activity-title">Activity</h2>
          {loading && transactions.length === 0 ? (
            <p className="w-empty">Loading activity…</p>
          ) : transactions.length === 0 ? (
            <div className="w-empty-card">
              <p>No transactions yet.</p>
              <p className="w-empty-hint">Add funds to pay for flights — your history will show up here.</p>
            </div>
          ) : (
            <ul className="w-tx-list">
              {transactions.map((tx) => {
                const amt = Number(tx.amount)
                const positive = amt >= 0
                return (
                  <li key={tx.id} className="w-tx-row">
                    <div className={`w-tx-icon w-tx-icon-${tx.type}`}>{txIcon(tx.type)}</div>
                    <div className="w-tx-body">
                      <p className="w-tx-title">{tx.description || tx.type.replace(/_/g, ' ')}</p>
                      <p className="w-tx-meta">{formatTxDate(tx.created_at)}</p>
                    </div>
                    <div className={`w-tx-amt ${positive ? 'w-tx-pos' : 'w-tx-neg'}`}>
                      {positive ? '+' : ''}
                      {formatNpr(amt)}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </main>

      {modalOpen && (
        <div className="w-overlay" role="presentation" onClick={() => !submitting && setModalOpen(false)}>
          <div className="w-modal" role="dialog" aria-labelledby="w-modal-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="w-modal-title" className="w-modal-title">
              Add to your wallet
            </h2>
            <p className="w-modal-desc">Demo top-up — no real card charge. NPR only.</p>

            <div className="w-presets">
              {PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`w-preset ${selectedPreset === n ? 'active' : ''}`}
                  onClick={() => applyPreset(n)}
                >
                  {formatNpr(n)}
                </button>
              ))}
            </div>

            <form onSubmit={handleAddFunds} className="w-form">
              <label className="w-label" htmlFor="w-amount">
                Custom amount (NPR)
              </label>
              <input
                id="w-amount"
                type="number"
                min="100"
                step="1"
                className="w-input"
                placeholder="e.g. 5000"
                value={amountStr}
                onChange={(e) => {
                  setAmountStr(e.target.value)
                  setSelectedPreset(null)
                }}
              />
              {modalError && <p className="w-field-error">{modalError}</p>}
              <div className="w-modal-actions">
                <button type="button" className="w-btn-secondary" disabled={submitting} onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="w-btn-primary" disabled={submitting}>
                  {submitting ? 'Processing…' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default WalletPage
