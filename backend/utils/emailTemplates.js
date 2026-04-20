function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatNpr(amount) {
  return `NPR ${Number(amount || 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

function formatBoardingDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatBoardingTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function shortAirportCode(city) {
  return String(city || "")
    .trim()
    .slice(0, 3)
    .toUpperCase();
}

function buildInfoRows(items) {
  return items
    .filter(
      (item) =>
        item &&
        item.value !== undefined &&
        item.value !== null &&
        String(item.value).trim() !== "",
    )
    .map(
      (item) => `
        <tr>
          <td style="padding:8px 0;color:#94a3b8;font-size:13px;">${escapeHtml(item.label)}</td>
          <td style="padding:8px 0;color:#e2e8f0;font-size:14px;font-weight:600;text-align:right;">${escapeHtml(item.value)}</td>
        </tr>`,
    )
    .join("");
}

function renderEmailCard({ heading, intro, infoRows, footerNote }) {
  return `
    <div style="margin:0;padding:24px;background:#08111f;font-family:Arial,Helvetica,sans-serif;color:#f5f7fb;">
      <div style="max-width:620px;margin:0 auto;background:#1a1f2e;border:1px solid #263042;border-radius:16px;overflow:hidden;">
        <div style="padding:20px 24px;border-bottom:1px solid rgba(255,255,255,0.08);background:linear-gradient(180deg,#0f1b2f 0%,#09101c 100%);">
          <p style="margin:0 0 8px;color:#93c5fd;font-size:12px;letter-spacing:0.24em;text-transform:uppercase;font-weight:700;">Binayak Airlines</p>
          <h2 style="margin:0;color:#ffffff;font-size:22px;line-height:1.3;">${escapeHtml(heading)}</h2>
          <p style="margin:12px 0 0;color:#c7d2e5;font-size:14px;line-height:1.6;">${escapeHtml(intro)}</p>
        </div>
        <div style="padding:20px 24px;">
          <table style="width:100%;border-collapse:collapse;">${infoRows}</table>
        </div>
        <div style="padding:16px 24px;border-top:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.02);color:#7f8ea8;font-size:12px;line-height:1.6;">
          ${escapeHtml(footerNote || "Need help? Reply to this email and our support team will assist you.")}
        </div>
      </div>
    </div>
  `;
}

function renderBoardingPassEmail({
  title,
  subtitle,
  passengerName,
  bookingId,
  flightNumber,
  origin,
  destination,
  departureTime,
  boardingTime,
  seatNumber,
  seatClass,
  passengers,
  totalPrice,
  bottomNote,
}) {
  const depDate = formatBoardingDate(departureTime);
  const depTime = formatBoardingTime(departureTime);
  const boardTime = formatBoardingTime(boardingTime);
  const passengerCount =
    Number.isFinite(Number(passengers)) && Number(passengers) > 0
      ? Number(passengers)
      : 1;
  const safeSeatClass = String(seatClass || "Economy").trim() || "Economy";
  const safeSeat = seatNumber ? String(seatNumber).trim() : "TBA";
  const safePassenger = passengerName || "Passenger";
  const safeFlight = flightNumber || "N/A";
  const safeOrigin = origin || "";
  const safeDestination = destination || "";
  const showTotal = Number.isFinite(Number(totalPrice));

  return `
  <div style="margin:0;padding:20px;background:#0a0a1a;font-family:Arial,Helvetica,sans-serif;color:#f5f7fb;">
    <div style="max-width:660px;margin:0 auto;">
      <p style="margin:0 0 12px;color:#93c5fd;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;">Binayak Airlines</p>
      <div style="margin:0 0 10px;color:#ffffff;font-size:26px;font-weight:700;line-height:1.15;">${escapeHtml(title)}</div>
      <p style="margin:0 0 18px;color:#c7d2e5;font-size:14px;line-height:1.6;">${escapeHtml(subtitle)}</p>

      <div style="background:#141428;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);">
        <div style="background:#1e1e3f;padding:24px 26px 20px;">
          <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 18px;">
            <tr>
              <td style="vertical-align:top;">
                <div style="font-size:10px;letter-spacing:3px;color:rgba(255,255,255,0.36);text-transform:uppercase;margin-bottom:4px;">Boarding Pass</div>
                <div style="font-size:22px;font-weight:700;color:#e8d48b;letter-spacing:2px;text-transform:uppercase;">Binayak Airlines</div>
              </td>
              <td style="vertical-align:top;text-align:right;">
                <span style="display:inline-block;background:rgba(232,212,139,0.12);border:1px solid rgba(232,212,139,0.3);color:#e8d48b;font-size:11px;letter-spacing:2px;padding:4px 10px;border-radius:4px;text-transform:uppercase;">${escapeHtml(safeSeatClass)}</span>
              </td>
            </tr>
          </table>

          <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 18px;">
            <tr>
              <td style="width:34%;vertical-align:top;">
                <div style="font-size:52px;font-weight:700;color:#fff;line-height:1;">${escapeHtml(shortAirportCode(safeOrigin))}</div>
                <div style="font-size:12px;color:rgba(255,255,255,0.45);letter-spacing:1px;text-transform:uppercase;margin-top:4px;">${escapeHtml(safeOrigin)}</div>
              </td>
              <td style="width:32%;vertical-align:middle;text-align:center;">
                <div style="font-size:23px;color:#e8d48b;line-height:1;">✈</div>
                <div style="font-size:11px;color:rgba(255,255,255,0.35);letter-spacing:2px;margin-top:6px;">${escapeHtml(safeFlight)}</div>
              </td>
              <td style="width:34%;vertical-align:top;text-align:right;">
                <div style="font-size:52px;font-weight:700;color:#fff;line-height:1;">${escapeHtml(shortAirportCode(safeDestination))}</div>
                <div style="font-size:12px;color:rgba(255,255,255,0.45);letter-spacing:1px;text-transform:uppercase;margin-top:4px;">${escapeHtml(safeDestination)}</div>
              </td>
            </tr>
          </table>

          <table role="presentation" style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:10px 0;border-right:1px solid rgba(255,255,255,0.06);">
                <div style="font-size:9px;letter-spacing:2px;color:rgba(255,255,255,0.35);text-transform:uppercase;margin-bottom:4px;">Passenger</div>
                <div style="font-size:13px;font-weight:600;color:#fff;line-height:1.35;">${escapeHtml(safePassenger)}</div>
              </td>
              <td style="padding:10px 0 10px 12px;border-right:1px solid rgba(255,255,255,0.06);">
                <div style="font-size:9px;letter-spacing:2px;color:rgba(255,255,255,0.35);text-transform:uppercase;margin-bottom:4px;">Date</div>
                <div style="font-size:16px;font-weight:600;color:#fff;">${escapeHtml(depDate)}</div>
              </td>
              <td style="padding:10px 0 10px 12px;border-right:1px solid rgba(255,255,255,0.06);">
                <div style="font-size:9px;letter-spacing:2px;color:rgba(255,255,255,0.35);text-transform:uppercase;margin-bottom:4px;">Departs</div>
                <div style="font-size:16px;font-weight:700;color:#e8d48b;">${escapeHtml(depTime)}</div>
              </td>
              <td style="padding:10px 0 10px 12px;">
                <div style="font-size:9px;letter-spacing:2px;color:rgba(255,255,255,0.35);text-transform:uppercase;margin-bottom:4px;">Seat</div>
                <div style="font-size:22px;font-weight:700;color:#fff;">${escapeHtml(safeSeat)}</div>
              </td>
            </tr>
          </table>
        </div>

        <div style="height:18px;background:#0e0e22;border-top:2px dashed rgba(255,255,255,0.1);"></div>

        <div style="background:#0e0e22;padding:16px 26px 18px;">
          <table role="presentation" style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="width:33%;padding:0 8px 10px 0;">
                <div style="font-size:9px;letter-spacing:2px;color:rgba(255,255,255,0.35);text-transform:uppercase;margin-bottom:4px;">Boarding</div>
                <div style="font-size:14px;color:#e8d48b;font-weight:700;">${escapeHtml(boardTime)}</div>
              </td>
              <td style="width:33%;padding:0 8px 10px 0;">
                <div style="font-size:9px;letter-spacing:2px;color:rgba(255,255,255,0.35);text-transform:uppercase;margin-bottom:4px;">Flight</div>
                <div style="font-size:14px;color:rgba(255,255,255,0.82);font-weight:600;">${escapeHtml(safeFlight)}</div>
              </td>
              <td style="width:33%;padding:0 0 10px;">
                <div style="font-size:9px;letter-spacing:2px;color:rgba(255,255,255,0.35);text-transform:uppercase;margin-bottom:4px;">Passengers</div>
                <div style="font-size:14px;color:rgba(255,255,255,0.82);font-weight:600;">${escapeHtml(String(passengerCount))}</div>
              </td>
            </tr>
          </table>
          <div style="font-size:10px;color:rgba(255,255,255,0.34);margin-top:2px;letter-spacing:1px;">
            BOOKING #${escapeHtml(String(bookingId || ""))}
            ${showTotal ? ` · ${escapeHtml(formatNpr(totalPrice))}` : ""}
          </div>
        </div>
      </div>

      <p style="margin:14px 0 0;font-size:12px;line-height:1.65;color:#8ea0c3;">
        ${escapeHtml(
          bottomNote ||
            "Please arrive early and keep this boarding pass with you at the airport.",
        )}
      </p>
    </div>
  </div>
  `;
}

function boardingPass({
  passengerName,
  bookingId,
  flightNumber,
  origin,
  destination,
  departureTime,
  boardingTime,
  seatNumber,
  seatClass,
  passengers,
  totalPrice,
}) {
  const normalizedBoardingTime =
    boardingTime ||
    new Date(new Date(departureTime).getTime() - 20 * 60 * 1000).toISOString();
  const subject = `Boarding Pass - ${flightNumber || "Binayak Airlines"}`;
  const html = renderBoardingPassEmail({
    title: "Your boarding pass",
    subtitle: `Hi ${passengerName || "Traveler"}, keep this email handy for check-in and boarding.`,
    passengerName,
    bookingId,
    flightNumber,
    origin,
    destination,
    departureTime,
    boardingTime: normalizedBoardingTime,
    seatNumber,
    seatClass,
    passengers,
    totalPrice,
    bottomNote:
      "Please arrive early and keep this boarding pass with you at the airport.",
  });
  return { subject, html };
}

function seatMovedToEmptySeat({
  passengerName,
  bookingId,
  flightNumber,
  origin,
  destination,
  departureTime,
  fromSeatNumber,
  toSeatNumber,
  priceDelta,
  boardingTime,
  passengers,
  bookingTotal,
  seatClass,
}) {
  const subject = `Boarding Pass Updated - ${flightNumber || "Binayak Airlines"}`;
  const normalizedBoardingTime =
    boardingTime ||
    new Date(new Date(departureTime).getTime() - 20 * 60 * 1000).toISOString();
  const adjustmentText =
    Number(priceDelta || 0) === 0
      ? "No fare difference."
      : priceDelta > 0
        ? `${formatNpr(priceDelta)} charged for this seat change.`
        : `${formatNpr(Math.abs(priceDelta))} refunded after this seat change.`;
  const html = renderBoardingPassEmail({
    title: "Your boarding pass was updated",
    subtitle: `Hi ${passengerName || "Traveler"}, your seat changed from ${fromSeatNumber || "TBA"} to ${toSeatNumber || "TBA"}.`,
    passengerName,
    bookingId,
    flightNumber,
    origin,
    destination,
    departureTime,
    boardingTime: normalizedBoardingTime,
    seatNumber: toSeatNumber,
    seatClass,
    passengers,
    totalPrice: bookingTotal,
    bottomNote: `Your latest seat assignment is reflected above. ${adjustmentText}`,
  });
  return { subject, html };
}

function bookingConfirmed({
  passengerName,
  bookingId,
  flightNumber,
  origin,
  destination,
  departureTime,
  totalPrice,
}) {
  const subject = "Booking Confirmed - Binayak Airlines";
  const html = renderEmailCard({
    heading: "Your booking is confirmed",
    intro: `Hi ${passengerName || "Traveler"}, your payment was successful and your seats are reserved.`,
    infoRows: buildInfoRows([
      { label: "Booking", value: `#${bookingId}` },
      {
        label: "Flight",
        value: `${flightNumber} (${origin} -> ${destination})`,
      },
      { label: "Departure", value: formatDate(departureTime) },
      { label: "Paid", value: formatNpr(totalPrice) },
    ]),
    footerNote:
      "Please arrive at the airport at least 2 hours before departure.",
  });
  return { subject, html };
}

function bookingCancelledByUser({
  passengerName,
  bookingId,
  flightNumber,
  origin,
  destination,
  departureTime,
  refundAmount,
  policyLabel,
}) {
  const subject = "Booking Cancelled - Refund Processed";
  const html = renderEmailCard({
    heading: "Your booking has been cancelled",
    intro: `Hi ${passengerName || "Traveler"}, we have cancelled your booking as requested.`,
    infoRows: buildInfoRows([
      { label: "Booking", value: `#${bookingId}` },
      {
        label: "Flight",
        value: `${flightNumber} (${origin} -> ${destination})`,
      },
      { label: "Departure", value: formatDate(departureTime) },
      { label: "Refund", value: formatNpr(refundAmount) },
      { label: "Policy", value: policyLabel || "Applied cancellation policy" },
    ]),
  });
  return { subject, html };
}

function bookingCancelledByAdmin({
  passengerName,
  bookingId,
  flightNumber,
  origin,
  destination,
  departureTime,
}) {
  const subject = "Booking Cancelled by Admin";
  const html = renderEmailCard({
    heading: "Booking cancelled by administrator",
    intro: `Hi ${passengerName || "Traveler"}, your booking was cancelled by an administrator.`,
    infoRows: buildInfoRows([
      { label: "Booking", value: `#${bookingId}` },
      {
        label: "Flight",
        value: `${flightNumber} (${origin} -> ${destination})`,
      },
      { label: "Departure", value: formatDate(departureTime) },
    ]),
  });
  return { subject, html };
}

function flightCancelledWithRefund({
  passengerName,
  bookingId,
  flightNumber,
  origin,
  destination,
  departureTime,
  refundAmount,
}) {
  const subject = "Flight Cancelled - Refund Issued";
  const html = renderEmailCard({
    heading: "Your flight was cancelled",
    intro: `Hi ${passengerName || "Traveler"}, this flight has been cancelled by the airline.`,
    infoRows: buildInfoRows([
      { label: "Booking", value: `#${bookingId}` },
      {
        label: "Flight",
        value: `${flightNumber} (${origin} -> ${destination})`,
      },
      { label: "Departure", value: formatDate(departureTime) },
      { label: "Refund", value: formatNpr(refundAmount) },
    ]),
  });
  return { subject, html };
}

function flightDelayed({
  passengerName,
  flightNumber,
  origin,
  destination,
  departureTime,
}) {
  const subject = "Flight Delayed - Schedule Update";
  const html = renderEmailCard({
    heading: "Flight status updated to delayed",
    intro: `Hi ${passengerName || "Traveler"}, your flight schedule has changed.`,
    infoRows: buildInfoRows([
      {
        label: "Flight",
        value: `${flightNumber} (${origin} -> ${destination})`,
      },
      { label: "Departure", value: formatDate(departureTime) },
      { label: "Status", value: "Delayed" },
    ]),
    footerNote: "Check your dashboard for the latest departure updates.",
  });
  return { subject, html };
}

function walletTopUp({ passengerName, amount, method }) {
  const subject = "Wallet Credited Successfully";
  const html = renderEmailCard({
    heading: "Wallet top-up received",
    intro: `Hi ${passengerName || "Traveler"}, your wallet was credited successfully.`,
    infoRows: buildInfoRows([
      { label: "Amount", value: formatNpr(amount) },
      { label: "Method", value: method || "Wallet top-up" },
      { label: "Processed at", value: formatDate(new Date()) },
    ]),
  });
  return { subject, html };
}

function swapRequested({
  targetName,
  requesterName,
  flightNumber,
  origin,
  destination,
}) {
  const subject = "Seat Swap Request Received";
  const html = renderEmailCard({
    heading: "New seat swap request",
    intro: `Hi ${targetName || "Traveler"}, ${requesterName || "another passenger"} requested a seat swap.`,
    infoRows: buildInfoRows([
      {
        label: "Flight",
        value: `${flightNumber} (${origin} -> ${destination})`,
      },
      { label: "Requested by", value: requesterName || "Passenger" },
      { label: "Action", value: "Open My Bookings to respond" },
    ]),
  });
  return { subject, html };
}

function swapAccepted({
  requesterName,
  targetName,
  flightNumber,
  origin,
  destination,
  requesterDelta,
}) {
  const subject = "Seat Swap Accepted";
  const html = renderEmailCard({
    heading: "Your seat swap was accepted",
    intro: `Hi ${requesterName || "Traveler"}, ${targetName || "the other passenger"} accepted your request.`,
    infoRows: buildInfoRows([
      {
        label: "Flight",
        value: `${flightNumber} (${origin} -> ${destination})`,
      },
      {
        label: "Fare adjustment",
        value:
          Number(requesterDelta || 0) === 0
            ? "No fare difference"
            : requesterDelta > 0
              ? `${formatNpr(requesterDelta)} charged`
              : `${formatNpr(Math.abs(requesterDelta))} refunded`,
      },
    ]),
  });
  return { subject, html };
}

function swapDeclined({ requesterName, flightNumber, origin, destination }) {
  const subject = "Seat Swap Declined";
  const html = renderEmailCard({
    heading: "Your seat swap was declined",
    intro: `Hi ${requesterName || "Traveler"}, your seat swap request was declined.`,
    infoRows: buildInfoRows([
      {
        label: "Flight",
        value: `${flightNumber} (${origin} -> ${destination})`,
      },
      { label: "Status", value: "Declined" },
    ]),
  });
  return { subject, html };
}

module.exports = {
  boardingPass,
  seatMovedToEmptySeat,
  bookingConfirmed,
  bookingCancelledByUser,
  bookingCancelledByAdmin,
  flightCancelledWithRefund,
  flightDelayed,
  walletTopUp,
  swapRequested,
  swapAccepted,
  swapDeclined,
};
