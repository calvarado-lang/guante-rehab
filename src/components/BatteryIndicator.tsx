export function BatteryIndicator({ value }: { value: number | null }) {
  const label = value === null ? '—' : `${value}%`
  const isLow = value !== null && value < 20

  return (
    <div className={isLow ? 'battery-indicator battery-low' : 'battery-indicator'}>
      <span className="info-label">Batería</span>
      <strong>{label}</strong>
    </div>
  )
}
