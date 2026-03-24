import { createPortal } from 'react-dom'
import SeatMapPreview from './SeatMapPreview'
import './SwapRequestModal.css'

function genderLabel(g) {
  if (g === 'female') return 'Female'
  if (g === 'male') return 'Male'
  return ''
}

export default function SwapRequestModal({
  request,
  seats,
  seatsLoading,
  acceptBlockReason,
  acceptError,
  onClose,
  onRefreshSeats,
  onAccept,
  onDecline,
  actionLoadingId,
  pendingAction,
}) {
  if (!request) return null

  const busy = actionLoadingId === request.id
  const acceptBusy = busy && pendingAction === 'accept'
  const declineBusy = busy && pendingAction === 'decline'
  const acceptDisabled = Boolean(seatsLoading || acceptBlockReason || busy)

  const modal = (
    <div
      className="srm-overlay mb-swap-detail-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="srm-modal mb-swap-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="srm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="srm-header">
          <div>
            <h2 id="srm-title" className="srm-title">
              Seat swap request
            </h2>
            <p className="srm-sub">
              Review the cabin map before you accept or decline.
            </p>
          </div>
          <button type="button" className="srm-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="srm-flight-card">
          <p className="srm-route">
            <strong>{request.origin}</strong>
            <span className="srm-arrow">→</span>
            <strong>{request.destination}</strong>
          </p>
          <p className="srm-meta">
            {request.flight_number} · {request.airline}
          </p>
          <p className="srm-meta">Departs {new Date(request.departure_time).toLocaleString()}</p>
        </div>

        <div className="srm-party">
          <p>
            <span className="srm-label">From</span>{' '}
            <strong>{request.requester_name}</strong>
          </p>
          <ul className="srm-seat-list">
            <li>
              Their seat (offered to you):{' '}
              <strong>{request.requester_seat_number}</strong>
              {request.requester_gender ? (
                <span className="srm-gender"> · {genderLabel(request.requester_gender)}</span>
              ) : null}
            </li>
            <li>
              Your seat (they want):{' '}
              <strong>{request.target_seat_number}</strong>
              {request.target_gender ? (
                <span className="srm-gender"> · {genderLabel(request.target_gender)}</span>
              ) : null}
            </li>
          </ul>
        </div>

        <div className="srm-before-after" aria-label="Seating before and after swap">
          <div className="srm-ba-col">
            <span className="srm-ba-heading">Now</span>
            <p>
              You: <strong>{request.target_seat_number}</strong>
            </p>
            <p>
              Them: <strong>{request.requester_seat_number}</strong>
            </p>
          </div>
          <div className="srm-ba-arrow" aria-hidden="true">
            ⇄
          </div>
          <div className="srm-ba-col srm-ba-after">
            <span className="srm-ba-heading">After swap</span>
            <p>
              You: <strong>{request.requester_seat_number}</strong>
            </p>
            <p>
              Them: <strong>{request.target_seat_number}</strong>
            </p>
          </div>
        </div>

        {(acceptBlockReason || acceptError) && (
          <div className="srm-alert" role="alert">
            {acceptError || acceptBlockReason}
          </div>
        )}

        <div className="srm-map-wrap">
          {seatsLoading ? (
            <p className="srm-map-loading">Loading latest seat map…</p>
          ) : (
            <SeatMapPreview
              seats={seats}
              requesterSeatId={request.requester_seat}
              targetSeatId={request.target_seat}
            />
          )}
        </div>

        <div className="srm-actions">
          <button
            type="button"
            className="srm-btn srm-btn-secondary"
            onClick={onRefreshSeats}
            disabled={seatsLoading || busy}
          >
            Refresh map
          </button>
          <button
            type="button"
            className="srm-btn srm-btn-decline"
            onClick={() => onDecline(request.id)}
            disabled={busy}
          >
            {declineBusy ? 'Working…' : 'Decline'}
          </button>
          <button
            type="button"
            className="srm-btn srm-btn-accept"
            onClick={() => onAccept(request.id)}
            disabled={acceptDisabled}
            title={(acceptError || acceptBlockReason) || undefined}
          >
            {acceptBusy ? 'Working…' : 'Accept swap'}
          </button>
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null
}
