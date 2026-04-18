export default function ChartCard({ title, children }) {
  return (
    <section className="ad-panel">
      <h3>{title}</h3>
      {children}
    </section>
  )
}
