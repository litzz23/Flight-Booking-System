export default function UpcomingFlights({ flights }) {
  if (flights.length === 0) {
    return <p className="ud-empty">No upcoming flights.</p>
  }

  return (
    <div className="ud-upcoming-grid">
      {flights.map((b) => (
        <article key={b.id} className="ud-upcoming-card">
          <h4>{b.origin} → {b.destination}</h4>
          <p>{b.airline} · {b.flight_number}</p>
          <p>{new Date(b.departure_time).toLocaleString()}</p>
        </article>
      ))}
    </div>
  )
}
