export default function FormModal({ title, open, onClose, onSubmit, children, submitLabel = 'Save' }) {
  if (!open) return null

  return (
    <div className="ad-modal-overlay" onClick={onClose}>
      <div className="ad-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ad-row-between">
          <h3>{title}</h3>
          <button type="button" className="ad-btn" onClick={onClose}>Close</button>
        </div>
        <form onSubmit={onSubmit}>
          {children}
          <div className="ad-actions" style={{ marginTop: '12px' }}>
            <button type="submit" className="ad-btn primary">{submitLabel}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
