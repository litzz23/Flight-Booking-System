function genderShort(g) {
  if (g === 'male') return 'M'
  if (g === 'female') return 'F'
  return null
}

function bookedGenderClass(seat) {
  if (seat?.status !== 'booked' || !seat.gender) return ''
  if (seat.gender === 'male') return ' ac-seat-booked-male'
  if (seat.gender === 'female') return ' ac-seat-booked-female'
  return ''
}

function seatTooltip(seat) {
  if (!seat) return 'Empty seat'
  const g =
    seat.status === 'booked' && seat.gender
      ? seat.gender === 'male'
        ? 'Male'
        : 'Female'
      : null
  if (g) return `Seat ${seat.seat_number} - ${g} passenger`
  return `Seat ${seat.seat_number}`
}

function highlightClass(swapPreviewMode, seat, requesterId, targetId) {
  if (!swapPreviewMode || !seat) return ''
  const rid = requesterId != null ? Number(requesterId) : NaN
  const tid = targetId != null ? Number(targetId) : NaN
  const sid = Number(seat.id)
  if (sid === rid) return ' ac-seat-highlight-requester'
  if (sid === tid) return ' ac-seat-highlight-target'
  return ''
}

function Seat({
  seat,
  isSelected,
  onToggleSeat,
  peerSwapMode,
  swapPreviewMode = false,
  swapPreviewRequesterSeatId,
  swapPreviewTargetSeatId,
  mySeatIds = [],
  peerSelectedIds = [],
  onPeerSwapSeatClick,
}) {
  if (peerSwapMode) {
    const disabled =
      !seat ||
      seat.status === 'reserved' ||
      seat.status === 'available'
    const mine = seat && mySeatIds.includes(seat.id)
    const selected = seat && peerSelectedIds.includes(seat.id)

    let seatClassName = 'ac-seat ac-seat-empty'
    if (seat) {
      if (selected) seatClassName = 'ac-seat ac-seat-selected'
      else if (mine) {
        const tint =
          seat.gender === 'male'
            ? ' ac-seat-mine-male'
            : seat.gender === 'female'
              ? ' ac-seat-mine-female'
              : ''
        seatClassName = `ac-seat ac-seat-mine${tint}`
      } else if (seat.status === 'booked') seatClassName = `ac-seat ac-seat-booked${bookedGenderClass(seat)}`
      else if (seat.status === 'reserved') seatClassName = 'ac-seat ac-seat-reserved'
      else seatClassName = 'ac-seat ac-seat-available'
    }

    const g = seat && seat.gender ? genderShort(seat.gender) : null

    return (
      <button
        type="button"
        className={seatClassName}
        disabled={disabled}
        onClick={() => seat && onPeerSwapSeatClick(seat)}
        aria-label={seat ? `Seat ${seat.seat_number}` : 'Empty seat'}
        title={seat ? seatTooltip(seat) : undefined}
      >
        {seat ? (
          <span className="ac-seat-inner">
            <span className="ac-seat-num">{seat.seat_number}</span>
            {g ? <span className="ac-seat-gender">{g}</span> : null}
          </span>
        ) : null}
      </button>
    )
  }

  if (swapPreviewMode) {
    let seatClassName = 'ac-seat ac-seat-empty ac-seat-preview'
    if (seat) {
      if (seat.status === 'booked') seatClassName = `ac-seat ac-seat-booked ac-seat-preview${bookedGenderClass(seat)}`
      else if (seat.status === 'reserved') seatClassName = 'ac-seat ac-seat-reserved ac-seat-preview'
      else if (seat.status === 'available') seatClassName = 'ac-seat ac-seat-available ac-seat-preview'
      else seatClassName = 'ac-seat ac-seat-empty ac-seat-preview'
      seatClassName += highlightClass(true, seat, swapPreviewRequesterSeatId, swapPreviewTargetSeatId)
    }

    const g = seat && seat.gender ? genderShort(seat.gender) : null

    return (
      <button
        type="button"
        className={seatClassName}
        disabled
        aria-label={seat ? `Seat ${seat.seat_number}` : 'Empty seat'}
        title={seat ? seatTooltip(seat) : undefined}
      >
        {seat ? (
          <span className="ac-seat-inner">
            <span className="ac-seat-num">{seat.seat_number}</span>
            {g ? <span className="ac-seat-gender">{g}</span> : null}
          </span>
        ) : null}
      </button>
    )
  }

  const isBlocked = !seat || seat.status === 'booked' || seat.status === 'reserved'

  let seatClassName = 'ac-seat ac-seat-empty'
  if (seat) {
    if (isSelected) seatClassName = 'ac-seat ac-seat-selected'
    else if (seat.status === 'booked') seatClassName = `ac-seat ac-seat-booked${bookedGenderClass(seat)}`
    else if (seat.status === 'reserved') seatClassName = 'ac-seat ac-seat-reserved'
    else seatClassName = 'ac-seat ac-seat-available'
  }

  const g = seat && seat.gender ? genderShort(seat.gender) : null

  return (
    <button
      type="button"
      className={seatClassName}
      disabled={isBlocked}
      onClick={() => seat && onToggleSeat(seat)}
      aria-label={seat ? `Seat ${seat.seat_number}` : 'Empty seat'}
      title={seat ? seatTooltip(seat) : undefined}
    >
      {seat ? (
        <span className="ac-seat-inner">
          <span className="ac-seat-num">{seat.seat_number}</span>
          {g ? <span className="ac-seat-gender">{g}</span> : null}
        </span>
      ) : null}
    </button>
  )
}

export default Seat
