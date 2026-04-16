import { useState } from 'react'
import { useAuth } from '../../AuthContext'
import { changePassword } from '../../services/userDashboardApi'

export default function DashboardProfilePage() {
  const { user } = useAuth()
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')

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
    <>
      <header className="ud-title-row">
        <h1>Profile</h1>
        <p>Your account details.</p>
      </header>

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
    </>
  )
}
