import AircraftSeatMap from './AircraftSeatMap'

export default function SeatMapPreview({ seats, requesterSeatId, targetSeatId }) {
  return (
    <AircraftSeatMap
      mode="swapPreview"
      seats={seats}
      swapPreviewRequesterSeatId={requesterSeatId}
      swapPreviewTargetSeatId={targetSeatId}
      selectedSeatIds={[]}
      onToggleSeat={() => {}}
    />
  )
}
