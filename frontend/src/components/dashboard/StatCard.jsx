export default function StatCard({ icon, title, value }) {
  return (
    <article className="ud-stat-card">
      <div className="ud-stat-icon" aria-hidden>{icon}</div>
      <div className="ud-stat-text">
        <span>{title}</span>
        <strong>{value}</strong>
      </div>
    </article>
  )
}
