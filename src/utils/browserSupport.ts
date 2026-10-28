export function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator
}

export function isWebSocketAvailable(): boolean {
  return typeof WebSocket !== 'undefined'
}
