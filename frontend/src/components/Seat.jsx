function genderShort(g) {
  if (g === "male") return "M";
  if (g === "female") return "F";
  return null;
}

function bookedGenderClass(seat) {
  if (seat?.status !== "booked" || !seat.gender) return "";
  if (seat.gender === "male") return " ac-seat-booked-male";
  if (seat.gender === "female") return " ac-seat-booked-female";
  return "";
}

function formatNpr(value) {
  return `NPR ${Number(value || 0).toLocaleString()}`;
}

function seatMetaText(seat) {
  if (!seat) return null;
  if (seat.status === "booked" && seat.gender) {
    return seat.gender === "male" ? "Male passenger" : "Female passenger";
  }
  if (seat.status === "booked") return "Booked";
  if (seat.status === "reserved") return "Reserved";
  if (seat.status === "available") return "Available";
  return null;
}

function seatBreakdownText(seat) {
  const rawItems = Array.isArray(seat?.price_breakdown_items)
    ? seat.price_breakdown_items
    : String(seat?.price_breakdown || "")
        .split("+")
        .map((s) => s.trim())
        .filter(Boolean);

  if (!rawItems.length) return null;

  const normalized = rawItems.map((item) => {
    const text = String(item).toLowerCase();
    if (text.includes("business")) return "Business class";
    if (text.includes("window")) return "Window seat";
    if (text.includes("aisle")) return "Aisle seat";
    if (text.includes("middle")) return "Middle seat";
    if (text.includes("front row")) return "Front row seat";
    if (text.includes("rear row")) return "Rear row seat";
    if (text.includes("base fare")) return "Standard fare";
    return String(item).replace(/[+%*]/g, "").trim();
  });

  const classLabel =
    String(seat?.class || "").toLowerCase() === "business"
      ? "Business class"
      : "Economy class";

  if (!normalized.includes(classLabel)) {
    normalized.unshift(classLabel);
  }

  return Array.from(new Set(normalized)).join(" • ");
}

function SeatTooltip({ seat, override }) {
  if (!seat) return null;
  const meta = override || seatMetaText(seat);
  const price = Number.isFinite(Number(seat.price))
    ? formatNpr(seat.price)
    : null;
  const breakdown = !override ? seatBreakdownText(seat) : null;

  return (
    <span className="ac-seat-tooltip" role="tooltip" aria-hidden="true">
      <span className="ac-seat-tooltip-title">Seat {seat.seat_number}</span>
      {meta ? <span className="ac-seat-tooltip-meta">{meta}</span> : null}
      {price ? <span className="ac-seat-tooltip-price">{price}</span> : null}
      {breakdown ? (
        <span className="ac-seat-tooltip-breakdown">{breakdown}</span>
      ) : null}
    </span>
  );
}

function highlightClass(swapPreviewMode, seat, requesterId, targetId) {
  if (!swapPreviewMode || !seat) return "";
  const rid = requesterId != null ? Number(requesterId) : NaN;
  const tid = targetId != null ? Number(targetId) : NaN;
  const sid = Number(seat.id);
  if (sid === rid) return " ac-seat-highlight-requester";
  if (sid === tid) return " ac-seat-highlight-target";
  return "";
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
    const mine = seat && mySeatIds.includes(seat.id);
    const peerSwapOff =
      seat &&
      seat.status === "booked" &&
      !mine &&
      seat.accepts_peer_swap === false;
    const disabled =
      !seat ||
      seat.status === "reserved" ||
      seat.status === "available" ||
      peerSwapOff;
    const selected = seat && peerSelectedIds.includes(seat.id);

    let seatClassName = "ac-seat ac-seat-empty";
    if (seat) {
      if (selected) seatClassName = "ac-seat ac-seat-selected";
      else if (mine) {
        const tint =
          seat.gender === "male"
            ? " ac-seat-mine-male"
            : seat.gender === "female"
              ? " ac-seat-mine-female"
              : "";
        seatClassName = `ac-seat ac-seat-mine${tint}`;
      } else if (peerSwapOff)
        seatClassName = "ac-seat ac-seat-booked ac-seat-peer-swap-off";
      else if (seat.status === "booked")
        seatClassName = `ac-seat ac-seat-booked${bookedGenderClass(seat)}`;
      else if (seat.status === "reserved")
        seatClassName = "ac-seat ac-seat-reserved";
      else seatClassName = "ac-seat ac-seat-available";
    }

    const g = seat && seat.gender ? genderShort(seat.gender) : null;

    return (
      <button
        type="button"
        className={seatClassName}
        disabled={disabled}
        onClick={() => seat && onPeerSwapSeatClick(seat)}
        aria-label={seat ? `Seat ${seat.seat_number}` : "Empty seat"}
      >
        {seat ? (
          <span className="ac-seat-inner">
            <span className="ac-seat-num">{seat.seat_number}</span>
            {g ? <span className="ac-seat-gender">{g}</span> : null}
          </span>
        ) : null}
        {seat ? (
          <SeatTooltip
            seat={seat}
            override={peerSwapOff ? "Swap requests not accepted" : null}
          />
        ) : null}
      </button>
    );
  }

  if (swapPreviewMode) {
    let seatClassName = "ac-seat ac-seat-empty ac-seat-preview";
    if (seat) {
      if (seat.status === "booked")
        seatClassName = `ac-seat ac-seat-booked ac-seat-preview${bookedGenderClass(seat)}`;
      else if (seat.status === "reserved")
        seatClassName = "ac-seat ac-seat-reserved ac-seat-preview";
      else if (seat.status === "available")
        seatClassName = "ac-seat ac-seat-available ac-seat-preview";
      else seatClassName = "ac-seat ac-seat-empty ac-seat-preview";
      seatClassName += highlightClass(
        true,
        seat,
        swapPreviewRequesterSeatId,
        swapPreviewTargetSeatId,
      );
    }

    const g = seat && seat.gender ? genderShort(seat.gender) : null;

    return (
      <button
        type="button"
        className={seatClassName}
        disabled
        aria-label={seat ? `Seat ${seat.seat_number}` : "Empty seat"}
      >
        {seat ? (
          <span className="ac-seat-inner">
            <span className="ac-seat-num">{seat.seat_number}</span>
            {g ? <span className="ac-seat-gender">{g}</span> : null}
          </span>
        ) : null}
        {seat ? <SeatTooltip seat={seat} /> : null}
      </button>
    );
  }

  const isBlocked =
    !seat || seat.status === "booked" || seat.status === "reserved";

  let seatClassName = "ac-seat ac-seat-empty";
  if (seat) {
    if (isSelected) seatClassName = "ac-seat ac-seat-selected";
    else if (seat.status === "booked")
      seatClassName = `ac-seat ac-seat-booked${bookedGenderClass(seat)}`;
    else if (seat.status === "reserved")
      seatClassName = "ac-seat ac-seat-reserved";
    else seatClassName = "ac-seat ac-seat-available";
  }

  const g = seat && seat.gender ? genderShort(seat.gender) : null;

  return (
    <button
      type="button"
      className={seatClassName}
      disabled={isBlocked}
      onClick={() => seat && onToggleSeat(seat)}
      aria-label={seat ? `Seat ${seat.seat_number}` : "Empty seat"}
    >
      {seat ? (
        <span className="ac-seat-inner">
          <span className="ac-seat-num">{seat.seat_number}</span>
          {g ? <span className="ac-seat-gender">{g}</span> : null}
        </span>
      ) : null}
      {seat ? <SeatTooltip seat={seat} /> : null}
    </button>
  );
}

export default Seat;
