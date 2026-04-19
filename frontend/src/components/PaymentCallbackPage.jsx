import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import FlightsHeader from './flights/FlightsHeader'
import { useAuth } from '../AuthContext'
import { payments as paymentAPI, wallet as walletAPI } from '../api'
import cloudsBg from '../assets/clouds-bg.png'
import './FlightDeals.css'
import './WalletPage.css'

function PaymentCallbackPage() {
  const { refreshUser } = useAuth()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState({
    status: '',
    message: '',
    credited_npr: null,
    total_balance_npr: null,
  })
  const [walletActivity, setWalletActivity] = useState([])

  const formatNpr = (n) => `NPR ${Number(n || 0).toLocaleString()}`
  const formatTxDate = (iso) =>
    new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })

  const params = useMemo(() => new URLSearchParams(location.search), [location.search])
  const queryString = useMemo(() => params.toString(), [params])
  const redirectTarget = useMemo(() => {
    const candidate = params.get('redirect')
    if (candidate && candidate.startsWith('/')) {
      return candidate
    }
    const stored = localStorage.getItem('walletReturnTo')
    return stored && stored.startsWith('/') ? stored : null
  }, [params])

  useEffect(() => {
    let mounted = true
    async function verify() {
      if (!queryString) {
        if (!mounted) return
        setResult({ status: 'failed', message: 'Missing callback query parameters.' })
        setLoading(false)
        return
      }
      try {
        const data = await paymentAPI.khaltiCallbackLookup(queryString)
        if (!mounted) return
        if (data.status === 'completed') {
          localStorage.removeItem('walletReturnTo')
        }
        setResult({
          status: data.status || 'failed',
          message: data.message || 'Payment verification completed.',
          credited_npr: data.credited_npr ?? null,
          total_balance_npr: data.total_balance_npr ?? null,
        })

        if (data.status === 'completed') {
          await refreshUser()
          const walletData = await walletAPI.get()
          if (!mounted) return
          setWalletActivity((walletData.transactions || []).slice(0, 5))
        }
      } catch (err) {
        if (!mounted) return
        setResult({
          status: 'failed',
          message: err.message || 'Payment verification failed.',
        })
      } finally {
        if (mounted) setLoading(false)
      }
    }

    verify()
    return () => {
      mounted = false
    }
  }, [queryString, refreshUser])

  const isSuccess = result.status === 'completed'
  const isPending = result.status === 'pending'

  return (
    <div className="w-page" style={{ backgroundImage: `url(${cloudsBg})` }}>
      <FlightsHeader />
      <main className="w-main" style={{ maxWidth: 680, margin: '30px auto' }}>
        <section className="w-hero-card">
          <div className="w-hero-inner">
            <h1 className="w-title" style={{ marginBottom: 12 }}>Payment Callback</h1>
            {loading ? (
              <p className="w-sub">Verifying Khalti payment, please wait...</p>
            ) : (
              <>
                <p className="w-sub">
                  {isSuccess
                    ? 'Wallet top-up successful.'
                    : isPending
                      ? 'Payment is pending confirmation.'
                      : 'Payment was not completed.'}
                </p>
                <p style={{ marginTop: 10 }}>{result.message}</p>
                {isSuccess && (
                  <div style={{ marginTop: 14 }}>
                    <p><strong>Amount credited:</strong> {formatNpr(result.credited_npr)}</p>
                    <p><strong>Total wallet balance:</strong> {formatNpr(result.total_balance_npr)}</p>
                  </div>
                )}
                <div className="w-hero-actions" style={{ marginTop: 18 }}>
                  {isSuccess && redirectTarget && (
                    <Link to={redirectTarget} className="w-btn-primary">
                      Back to where you left off
                    </Link>
                  )}
                  <Link to="/wallet" className="w-btn-primary">
                    Back to Wallet
                  </Link>
                  <Link to="/flights" className="w-btn-secondary">
                    Continue Browsing
                  </Link>
                </div>
                {isSuccess && (
                  <div style={{ marginTop: 20 }}>
                    <h3 className="w-activity-title">Wallet activity</h3>
                    {walletActivity.length === 0 ? (
                      <p className="w-empty">No wallet activity found.</p>
                    ) : (
                      <ul className="w-tx-list">
                        {walletActivity.map((tx) => {
                          const amt = Number(tx.amount)
                          const positive = amt >= 0
                          return (
                            <li key={tx.id} className="w-tx-row">
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
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

export default PaymentCallbackPage
