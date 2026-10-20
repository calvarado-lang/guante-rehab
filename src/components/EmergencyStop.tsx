import { useState } from 'react'
import { getActiveTransport } from '../store/deviceStore'
import { useSessionStore } from '../store/sessionStore'

export function EmergencyStop() {
  const [isSending, setIsSending] = useState(false)
  const emergencyStop = useSessionStore((state) => state.emergencyStop)
  const setError = useSessionStore((state) => state.setError)

  const handleEmergencyStop = async () => {
    setIsSending(true)
    try {
      await getActiveTransport()?.sendCommand({ type: 'ESTOP' })
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No fue posible enviar el paro al guante.')
    } finally {
      emergencyStop()
      setIsSending(false)
    }
  }

  return (
    <button
      className="emergency-button"
      type="button"
      onClick={() => void handleEmergencyStop()}
      disabled={isSending}
      aria-label="Paro de emergencia"
    >
      {isSending ? 'Enviando paro…' : 'PARO DE EMERGENCIA'}
    </button>
  )
}
