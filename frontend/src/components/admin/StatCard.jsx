export default function StatCard({ icon, title, value }) {
  return (
    <article className="ad-stat-card">
      <div className="ad-stat-icon" aria-hidden>{icon}</div>
      <div className="ad-stat-text">
        <span>{title}</span>
        <strong>{value}</strong>
      </div>
    </article>
  )
}
