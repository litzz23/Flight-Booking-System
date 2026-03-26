import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { bookings as bookingsAPI, flights as flightsAPI, seats as seatsAPI, swapRequests as swapRequestsAPI } from '../api'
import cloudsBg from '../assets/clouds-bg.png'
import AircraftSeatMap from './AircraftSeatMap'
import SwapRequestModal from './SwapRequestModal'
import { getSwapPreviewBlockReason } from '../utils/swapPreviewValidation'
import './MyBookings.css'

function MyBookings() {
  const navigate = useNavigate()
  const { user, logout, refreshUser } = useAuth()
  const [bookings, setBookings] = useState([])
  const [incomingSwapRequests, setIncomingSwapRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [cancellingId, setCancellingId] = useState(null)
  const [swappingId, setSwappingId] = useState(null)
  const [swapModal, setSwapModal] = useState(null)
  const [peerSwapModal, setPeerSwapModal] = useState(null)
  const [peerSubmitting, setPeerSubmitting] = useState(false)
  const [swapReqActionId, setSwapReqActionId] = useState(null)
  const [cancelModal, setCancelModal] = useState(null)
  const [policyAck, setPolicyAck] = useState(false)
  const [swapDetailRequest, setSwapDetailRequest] = useState(null)
  const [swapDetailSeats, setSwapDetailSeats] = useState([])
  const [swapDetailLoading, setSwapDetailLoading] = useState(false)
  const [swapDetailAcceptError, setSwapDetailAcceptError] = useState(null)
  const [swapDetailPendingAction, setSwapDetailPendingAction] = useState(null)

  const refreshDashboard = useCallback(async () => {
    if (!user) return
    try {
      const b = await bookingsAPI.getAll()
      setBookings(b)
    } catch {
      /* ignore */
    }
    try {
      const incoming = await swapRequestsAPI.list()
      setIncomingSwapRequests(incoming)
    } catch {
      setIncomingSwapRequests([])
    }
  }, [user])

  useEffect(() => {
    if (!user) {
      navigate('/auth')
      return
    }
    setLoading(true)
    refreshDashboard().finally(() => setLoading(false))
  }, [user, navigate, refreshDashboard])

  useEffect(() => {
    if (!user) return
    const t = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        refreshDashboard()
      }
    }, 25000)
    return () => clearInterval(t)
  }, [user, refreshDashboard])

  useEffect(() => {
    if (!peerSwapModal) return
    const flightId = peerSwapModal.booking?.flight_id
    if (!flightId) return
    const t = setInterval(async () => {
      try {
        const seats = await flightsAPI.getSeats(flightId)
        setPeerSwapModal((prev) => (prev ? { ...prev, seats } : null))
      } catch {
        /* ignore */
      }
    }, 15000)
    return () => clearInterval(t)
  }, [peerSwapModal?.booking?.flight_id])

  const openCancelModal = (b) => {
    setPolicyAck(false)
    setCancelModal(b)
  }

  const closeCancelModal = () => {
    setCancelModal(null)
    setPolicyAck(false)
  }

  const confirmCancel = async () => {
    if (!cancelModal || !policyAck) return
    const id = cancelModal.id
    setCancellingId(id)
    try {
      const res = await bookingsAPI.cancel(id)
      await refreshUser()
      setBookings(prev =>
        prev.map(b =>
          b.id === id
            ? { ...b, status: 'cancelled', cancellation: { ...b.cancellation, allowed: false, reason: 'This booking is already cancelled.' } }
            : b
        )
      )
      closeCancelModal()
      const refund = res.refund_amount != null ? formatPrice(res.refund_amount) : null
      const fee = res.fee_amount != null ? formatPrice(res.fee_amount) : null
      const credited = res.wallet_credit != null && Number(res.wallet_credit) > 0
        ? `Credited to wallet: ${formatPrice(res.wallet_credit)}`
        : null
      alert(
        [res.message, refund != null && `Estimated refund: ${refund}`, fee != null && Number(res.fee_amount) > 0 && `Cancellation fee: ${fee}`, credited]
          .filter(Boolean)
          .join('\n\n')
      )
    } catch (err) {
      alert(err.message)
    } finally {
      setCancellingId(null)
    }
  }

  const formatPrice = (num) => 'NPR ' + Number(num).toLocaleString()
  const formatDate = (dateStr) => new Date(dateStr).toLocaleString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const genderLabel = (g) => (g === 'female' ? 'Female' : g === 'male' ? 'Male' : '')

  const getTravelers = (b) => {
    let d = b.passenger_details
    if (d == null) {
      return [{ name: b.passenger_name, email: b.passenger_email, phone: b.passenger_phone }]
    }
    if (typeof d === 'string') {
      try {
        d = JSON.parse(d)
      } catch {
        return [{ name: b.passenger_name, email: b.passenger_email, phone: b.passenger_phone }]
      }
    }
    if (Array.isArray(d) && d.length > 0) return d
    return [{ name: b.passenger_name, email: b.passenger_email, phone: b.passenger_phone }]
  }

  const getMySeatIds = (booking) =>
    (booking.seat_assignments || []).map((s) => s.seat_id).filter(Boolean)

  const openSwapOptions = async (booking) => {
    try {
      const seats = await flightsAPI.getSeats(booking.flight_id)
      setSwapModal({
        booking,
        seats,
        targetSeatId: null,
      })
    } catch {
      alert('Unable to load available seats right now.')
    }
  }

  const openPeerSwap = async (booking) => {
    try {
      const seats = await flightsAPI.getSeats(booking.flight_id)
      setPeerSwapModal({
        booking,
        seats,
        step: 1,
        fromSeatId: null,
        toSeatId: null,
      })
    } catch {
      alert('Unable to load seat map right now.')
    }
  }

  const handlePeerSeatClick = (seat) => {
    if (!peerSwapModal) return
    const myIds = getMySeatIds(peerSwapModal.booking)
    const { step, fromSeatId } = peerSwapModal

    if (step === 1) {
      if (!myIds.includes(seat.id)) {
        alert('First, tap one of your booked seats (highlighted).')
        return
      }
      setPeerSwapModal((p) => (p ? { ...p, step: 2, fromSeatId: seat.id, toSeatId: null } : null))
      return
    }

    if (myIds.includes(seat.id)) {
      if (seat.id === fromSeatId) {
        setPeerSwapModal((p) => (p ? { ...p, step: 1, fromSeatId: null, toSeatId: null } : null))
      } else {
        alert('Choose another passenger\'s seat, not yours.')
      }
      return
    }
    if (seat.status !== 'booked') {
      alert('Select a seat that is already booked by another passenger.')
      return
    }
    setPeerSwapModal((p) => (p ? { ...p, toSeatId: seat.id } : null))
  }

  const submitPeerSwapRequest = async () => {
    if (!peerSwapModal?.fromSeatId || !peerSwapModal?.toSeatId) return
    const fromSeat = peerSwapModal.seats.find((s) => s.id === peerSwapModal.fromSeatId)
    const toSeat = peerSwapModal.seats.find((s) => s.id === peerSwapModal.toSeatId)
    if (!fromSeat?.gender || !toSeat?.gender) {
      alert('Seat map is missing gender for one of the seats. Refresh and try again.')
      return
    }
    if (fromSeat.gender !== toSeat.gender) {
      const other = genderLabel(toSeat.gender)
      const msg =
        toSeat.gender === 'female'
          ? 'You are swapping with a female passenger. Do you want to continue?'
          : 'You are swapping with a male passenger. Do you want to continue?'
      if (!window.confirm(`${msg}\n\nYour seat: ${fromSeat.seat_number} (${genderLabel(fromSeat.gender)}) → Their seat: ${toSeat.seat_number} (${other}).`)) {
        return
      }
    }
    setPeerSubmitting(true)
    try {
      await swapRequestsAPI.create({
        flight_id: peerSwapModal.booking.flight_id,
        requester_seat: peerSwapModal.fromSeatId,
        target_seat: peerSwapModal.toSeatId,
        requester_gender: fromSeat.gender,
        target_gender: toSeat.gender,
      })
      setPeerSwapModal(null)
      alert('Swap request sent. The other passenger will see it under Pending requests.')
      await refreshDashboard()
    } catch (err) {
      alert(err.message)
    } finally {
      setPeerSubmitting(false)
    }
  }

  const handleSwap = async () => {
    if (!swapModal) return
    const target = Number(swapModal.targetSeatId)
    const booking = swapModal.booking
    const currentSeatId = booking.seat_assignments?.[0]?.seat_id
    if (!target || !currentSeatId) return
    setSwappingId(booking.id)
    try {
      await seatsAPI.swap({
        bookingId: booking.id,
        fromSeatId: currentSeatId,
        toSeatId: target,
      })
      await refreshDashboard()
      setSwapModal(null)
      alert('Seat moved to the new seat successfully.')
    } catch (err) {
      alert(err.message)
    } finally {
      setSwappingId(null)
    }
  }

  const closeSwapDetail = () => {
    setSwapDetailRequest(null)
    setSwapDetailSeats([])
    setSwapDetailAcceptError(null)
    setSwapDetailLoading(false)
    setSwapDetailPendingAction(null)
  }

  const openSwapDetail = async (r) => {
    setSwapDetailAcceptError(null)
    setSwapDetailRequest(r)
    setSwapDetailLoading(true)
    setSwapDetailSeats([])
    try {
      const seats = await flightsAPI.getSeats(r.flight_id)
      setSwapDetailSeats(seats)
    } catch {
      setSwapDetailSeats([])
      setSwapDetailAcceptError('Unable to load the seat map. Use Refresh map to try again.')
    } finally {
      setSwapDetailLoading(false)
    }
  }

  const refreshSwapDetailSeats = async () => {
    if (!swapDetailRequest) return
    setSwapDetailLoading(true)
    setSwapDetailAcceptError(null)
    try {
      const seats = await flightsAPI.getSeats(swapDetailRequest.flight_id)
      setSwapDetailSeats(seats)
    } catch {
      setSwapDetailAcceptError('Unable to load the seat map.')
    } finally {
      setSwapDetailLoading(false)
    }
  }

  const refreshOtherModalsSeats = async () => {
    if (swapModal?.booking?.flight_id) {
      try {
        const seats = await flightsAPI.getSeats(swapModal.booking.flight_id)
        setSwapModal((prev) => (prev ? { ...prev, seats } : null))
      } catch {
        /* ignore */
      }
    }
    if (peerSwapModal?.booking?.flight_id) {
      try {
        const seats = await flightsAPI.getSeats(peerSwapModal.booking.flight_id)
        setPeerSwapModal((prev) => (prev ? { ...prev, seats } : null))
      } catch {
        /* ignore */
      }
    }
  }

  const acceptSwapFromDetail = async (id) => {
    if (!swapDetailRequest || swapDetailRequest.id !== id) return
    setSwapReqActionId(id)
    setSwapDetailPendingAction('accept')
    setSwapDetailAcceptError(null)
    try {
      const seats = await flightsAPI.getSeats(swapDetailRequest.flight_id)
      setSwapDetailSeats(seats)
      const block = getSwapPreviewBlockReason(swapDetailRequest, seats, user?.id)
      if (block) {
        setSwapDetailAcceptError(block)
        return
      }
      await swapRequestsAPI.accept(id)
      await refreshDashboard()
      closeSwapDetail()
      await refreshOtherModalsSeats()
      alert('Swap accepted. Seats have been updated.')
    } catch (err) {
      const raw = err?.message || 'Could not complete swap.'
      const friendly =
        /no longer available|not available for swap|409/i.test(raw)
          ? 'Seat is no longer available for swap.'
          : raw
      setSwapDetailAcceptError(friendly)
      try {
        const seats = await flightsAPI.getSeats(swapDetailRequest.flight_id)
        setSwapDetailSeats(seats)
      } catch {
        /* ignore */
      }
    } finally {
      setSwapReqActionId(null)
      setSwapDetailPendingAction(null)
    }
  }

  const declineSwapFromDetail = async (id) => {
    setSwapReqActionId(id)
    setSwapDetailPendingAction('decline')
    setSwapDetailAcceptError(null)
    try {
      await swapRequestsAPI.decline(id)
      await refreshDashboard()
      closeSwapDetail()
    } catch (err) {
      alert(err.message)
    } finally {
      setSwapReqActionId(null)
      setSwapDetailPendingAction(null)
    }
  }

  const swapDetailBlockReason =
    swapDetailRequest && user && !swapDetailLoading
      ? getSwapPreviewBlockReason(swapDetailRequest, swapDetailSeats, user.id)
      : null

  return (
    <div className="mb-page" style={{ backgroundImage: `url(${cloudsBg})` }}>
      <header className="mb-header">
        <span className="mb-logo" onClick={() => navigate('/')}>Binayak's Flights</span>
        <div className="mb-header-actions">
          <button type="button" className="mb-wallet-pill" onClick={() => navigate('/wallet')} title="Wallet">
            <span className="mb-wallet-lbl">Wallet</span>
            <span className="mb-wallet-val">NPR {Number(user?.wallet_balance ?? 0).toLocaleString()}</span>
          </button>
          <button className="mb-nav-btn" onClick={() => navigate('/flights')}>Flight Deals</button>
          <span className="mb-user-name">{user?.name}</span>
          <button className="mb-nav-btn mb-logout" onClick={logout}>Logout</button>
        </div>
      </header>

      <div className="mb-content">
        <h1 className="mb-title">My Bookings</h1>
        <p className="mb-intro">
          Cancel online up to 2 hours before departure. Refunds are estimated by notice window (48h / 24h / 2h tiers). Airline-cancelled flights need support.
        </p>

        {!loading && incomingSwapRequests.length > 0 && (
          <section className="mb-pending-swaps" aria-labelledby="mb-pending-swaps-title">
            <h2 id="mb-pending-swaps-title" className="mb-pending-swaps-title">Pending seat swap requests</h2>
            <p className="mb-pending-swaps-hint">Someone wants to exchange seats with you. Open a request to see the full cabin map, then accept or decline.</p>
            <ul className="mb-pending-swaps-list">
              {incomingSwapRequests.map((r) => (
                <li key={r.id} className="mb-swap-request-card">
                  <div className="mb-swap-request-head">
                    <strong>{r.requester_name}</strong>
                    <span className="mb-swap-request-time">{formatDate(r.created_at)}</span>
                  </div>
                  <p className="mb-swap-request-route">{r.flight_number} · {r.origin} → {r.destination}</p>
                  <p className="mb-swap-request-seats">
                    Offers <strong>{r.requester_seat_number}</strong>
                    {r.requester_gender ? ` (${genderLabel(r.requester_gender)})` : ''} for your{' '}
                    <strong>{r.target_seat_number}</strong>
                    {r.target_gender ? ` (${genderLabel(r.target_gender)})` : ''}
                  </p>
                  <p className="mb-swap-request-depart">Departs {formatDate(r.departure_time)}</p>
                  <button
                    type="button"
                    className="mb-swap-open-detail"
                    disabled={swapReqActionId === r.id}
                    onClick={() => openSwapDetail(r)}
                  >
                    View seat map & respond
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {loading ? (
          <p className="mb-loading">Loading your bookings...</p>
        ) : bookings.length === 0 ? (
          <div className="mb-empty">
            <p>You haven't booked any flights yet.</p>
            <button className="mb-btn-primary" onClick={() => navigate('/flights')}>Browse Flight Deals</button>
          </div>
        ) : (
          <div className="mb-list">
            {bookings.map(b => (
              <div className={`mb-card ${b.status}`} key={b.id}>
                <div className="mb-card-top">
                  <div className="mb-route">
                    <span className="mb-city">{b.origin}</span>
                    <span className="mb-arrow">→</span>
                    <span className="mb-city">{b.destination}</span>
                  </div>
                  <span className={`mb-status mb-status-${b.status}`}>{b.status}</span>
                </div>

                <div className="mb-card-details">
                  <div className="mb-detail">
                    <span className="mb-label">Flight</span>
                    <span className="mb-value">{b.flight_number} · {b.airline}</span>
                    {b.flight_status && b.flight_status !== 'scheduled' && (
                      <span className={`mb-flight-status mb-flight-${b.flight_status}`}>{b.flight_status}</span>
                    )}
                  </div>
                  <div className="mb-detail">
                    <span className="mb-label">Departure</span>
                    <span className="mb-value">{formatDate(b.departure_time)}</span>
                  </div>
                  <div className="mb-detail">
                    <span className="mb-label">Passengers</span>
                    <span className="mb-value">{b.passengers} · {b.seat_class}</span>
                  </div>
                  <div className="mb-detail">
                    <span className="mb-label">Seat</span>
                    <span className="mb-value">
                      {b.seat_assignments?.[0]?.seat_number || 'Not assigned yet'}
                      {b.seat_assignments?.[0]?.gender
                        ? ` · ${genderLabel(b.seat_assignments[0].gender)}`
                        : ''}
                    </span>
                  </div>
                  <div className="mb-detail mb-detail-travelers">
                    <span className="mb-label">Travelers</span>
                    <ul className="mb-traveler-list">
                      {getTravelers(b).map((t, i) => (
                        <li key={i} className="mb-traveler-item">
                          <span className="mb-traveler-name">{t.name}</span>
                          <span className="mb-traveler-email">{t.email}</span>
                          {t.phone ? <span className="mb-traveler-phone">{t.phone}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="mb-detail">
                    <span className="mb-label">Total</span>
                    <span className="mb-value mb-price">{formatPrice(b.total_price)}</span>
                  </div>
                </div>

                <div className="mb-card-footer mb-card-footer-wrap">
                  <span className="mb-booking-id">Booking #{b.id}</span>
                  <div className="mb-card-footer-btns">
                    {b.status === 'confirmed' && b.seat_assignments?.[0] && (
                      <>
                        <button type="button" className="mb-cancel-btn mb-swap-btn" onClick={() => openSwapOptions(b)}>
                          Move to empty seat
                        </button>
                        <button type="button" className="mb-cancel-btn mb-peer-swap-btn" onClick={() => openPeerSwap(b)}>
                          Request swap with passenger
                        </button>
                      </>
                    )}
                    {b.status === 'confirmed' && b.cancellation?.allowed && (
                      <button type="button" className="mb-cancel-btn" onClick={() => openCancelModal(b)} disabled={cancellingId === b.id}>
                        {cancellingId === b.id ? 'Cancelling...' : 'Cancel booking'}
                      </button>
                    )}
                  </div>
                  {b.status === 'confirmed' && b.cancellation && !b.cancellation.allowed && (
                    <span className="mb-cancel-blocked" title={b.cancellation.reason}>
                      Cancellation unavailable
                    </span>
                  )}
                </div>
                {b.status === 'confirmed' && b.cancellation?.allowed && (
                  <p className="mb-policy-hint">
                    {b.cancellation.policy_label}
                    {b.cancellation.hours_until_departure != null && (
                      <span className="mb-policy-time"> · {Math.max(0, Math.floor(b.cancellation.hours_until_departure))}h until departure</span>
                    )}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {cancelModal && cancelModal.cancellation?.allowed && (
        <div className="mb-modal-overlay" role="presentation" onClick={closeCancelModal}>
          <div
            className="mb-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mb-cancel-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="mb-cancel-title" className="mb-modal-title">Cancel this booking?</h2>
            <p className="mb-modal-lead">This cannot be undone. Your seats will be returned to inventory.</p>

            <div className="mb-modal-trip">
              <div className="mb-modal-route">
                <span>{cancelModal.origin}</span>
                <span className="mb-arrow">→</span>
                <span>{cancelModal.destination}</span>
              </div>
              <p className="mb-modal-meta">
                {cancelModal.flight_number} · {cancelModal.airline} · Departs {formatDate(cancelModal.departure_time)}
              </p>
              <p className="mb-modal-price">Paid {formatPrice(cancelModal.total_price)} · {cancelModal.passengers} passenger(s)</p>
            </div>

            <div className="mb-modal-measures">
              <h3 className="mb-modal-sub">Cancellation policy</h3>
              <ul>
                <li>Online cancellation closes <strong>2 hours</strong> before departure.</li>
                <li><strong>48+ hours</strong> before: full refund (estimated).</li>
                <li><strong>24–48 hours</strong> before: 75% refund; 25% fee.</li>
                <li><strong>2–24 hours</strong> before: 50% refund; 50% fee.</li>
                <li>Airline-cancelled or completed flights: use support, not this button.</li>
              </ul>
            </div>

            <div className="mb-modal-estimate">
              <span className="mb-modal-est-label">Applies to your booking</span>
              <p className="mb-modal-policy-line">{cancelModal.cancellation.policy_label}</p>
              <div className="mb-modal-amounts">
                <span>Est. refund <strong>{formatPrice(cancelModal.cancellation.refund_amount)}</strong></span>
                {cancelModal.cancellation.fee_amount > 0 && (
                  <span>Fee <strong>{formatPrice(cancelModal.cancellation.fee_amount)}</strong></span>
                )}
              </div>
            </div>

            <label className="mb-modal-check">
              <input
                type="checkbox"
                checked={policyAck}
                onChange={(e) => setPolicyAck(e.target.checked)}
              />
              <span>I understand the refund estimate, fees, and that this action is final.</span>
            </label>

            <div className="mb-modal-actions">
              <button type="button" className="mb-modal-back" onClick={closeCancelModal}>
                Keep booking
              </button>
              <button
                type="button"
                className="mb-modal-confirm"
                onClick={confirmCancel}
                disabled={!policyAck || cancellingId === cancelModal.id}
              >
                {cancellingId === cancelModal.id ? 'Cancelling…' : 'Confirm cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {swapModal && (
        <div className="mb-modal-overlay" role="presentation" onClick={() => setSwapModal(null)}>
          <div
            className="mb-modal mb-swap-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mb-empty-swap-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="mb-empty-swap-title" className="mb-modal-title">Move to an empty seat</h2>
            <p className="mb-modal-lead">
              Current seat: <strong>{swapModal.booking.seat_assignments?.[0]?.seat_number}</strong>. Tap an available (green) seat.
            </p>
            <AircraftSeatMap
              seats={swapModal.seats}
              selectedSeatIds={swapModal.targetSeatId ? [swapModal.targetSeatId] : []}
              onToggleSeat={(seat) => {
                if (seat.status !== 'available') return
                setSwapModal((prev) => {
                  if (!prev) return prev
                  return {
                    ...prev,
                    targetSeatId: prev.targetSeatId === seat.id ? null : seat.id,
                  }
                })
              }}
            />
            <div className="mb-modal-actions">
              <button type="button" className="mb-modal-back" onClick={() => setSwapModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="mb-modal-confirm"
                onClick={handleSwap}
                disabled={swappingId === swapModal.booking.id || !swapModal.targetSeatId}
              >
                {swappingId === swapModal.booking.id ? 'Moving…' : 'Confirm move'}
              </button>
            </div>
          </div>
        </div>
      )}

      {swapDetailRequest && (
        <SwapRequestModal
          request={swapDetailRequest}
          seats={swapDetailSeats}
          seatsLoading={swapDetailLoading}
          acceptBlockReason={swapDetailBlockReason}
          acceptError={swapDetailAcceptError}
          onClose={closeSwapDetail}
          onRefreshSeats={refreshSwapDetailSeats}
          onAccept={acceptSwapFromDetail}
          onDecline={declineSwapFromDetail}
          actionLoadingId={swapReqActionId}
          pendingAction={swapDetailPendingAction}
        />
      )}

      {peerSwapModal && (
        <div className="mb-modal-overlay" role="presentation" onClick={() => setPeerSwapModal(null)}>
          <div
            className="mb-modal mb-swap-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mb-peer-swap-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="mb-peer-swap-title" className="mb-modal-title">Request swap with another passenger</h2>
            <p className="mb-modal-lead">
              {peerSwapModal.step === 1
                ? 'Step 1: Tap one of your seats (blue).'
                : 'Step 2: Tap another passenger\'s booked seat (male = blue, female = pink). Hover for a tooltip.'}
            </p>
            {peerSwapModal.step === 2 && peerSwapModal.fromSeatId && peerSwapModal.toSeatId && (
              <p className="mb-peer-swap-summary">
                {(() => {
                  const a = peerSwapModal.seats.find((s) => s.id === peerSwapModal.fromSeatId)
                  const t = peerSwapModal.seats.find((s) => s.id === peerSwapModal.toSeatId)
                  if (!a || !t) return null
                  return (
                    <>
                      Request: <strong>{a.seat_number}</strong>
                      {a.gender ? ` (${genderLabel(a.gender)})` : ''} ↔ <strong>{t.seat_number}</strong>
                      {t.gender ? ` (${genderLabel(t.gender)})` : ''}
                    </>
                  )
                })()}
              </p>
            )}
            <AircraftSeatMap
              mode="peerSwap"
              seats={peerSwapModal.seats}
              selectedSeatIds={[]}
              mySeatIds={getMySeatIds(peerSwapModal.booking)}
              peerSelectedIds={[peerSwapModal.fromSeatId, peerSwapModal.toSeatId].filter(Boolean)}
              onToggleSeat={() => {}}
              onPeerSwapSeatClick={handlePeerSeatClick}
            />
            <div className="mb-modal-actions mb-modal-actions-stack">
              <button type="button" className="mb-modal-back" onClick={() => setPeerSwapModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="mb-modal-confirm mb-peer-submit"
                onClick={submitPeerSwapRequest}
                disabled={peerSubmitting || !peerSwapModal.fromSeatId || !peerSwapModal.toSeatId}
              >
                {peerSubmitting ? 'Sending…' : 'Send swap request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MyBookings
