import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import WalletPanel from '../../components/dashboard/WalletPanel'
import { getTransactions, getWallet } from '../../services/userDashboardApi'

export default function DashboardWalletPage() {
  const navigate = useNavigate()
  const [wallet, setWallet] = useState({ balance: 0 })
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const [walletData, txData] = await Promise.all([getWallet(), getTransactions()])
        setWallet(walletData)
        setTransactions(txData)
      } catch (err) {
        setError(err.response?.data?.error || err.message || 'Failed to load wallet.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <>
      <header className="ud-title-row">
        <h1>Wallet</h1>
        <p>Balance and transaction history.</p>
      </header>

      {error ? <p className="ud-error">{error}</p> : null}
      {loading ? (
        <p className="ud-empty">Loading wallet...</p>
      ) : (
        <WalletPanel
          balance={wallet.balance}
          transactions={transactions}
          onOpenWallet={() => navigate('/wallet')}
        />
      )}
    </>
  )
}
