import type { ConnectionState } from '../store/deviceStore'

const labels: Record<ConnectionState, string> = {
  desconectado: 'Desconectado',
  conectando: 'Conectando',
  conectado: 'Conectado',
  reconectando: 'Reconectando',
  error: 'Error',
}

export function ConnectionBadge({ state }: { state: ConnectionState }) {
  return (
    <span className={`status-pill status-${state}`} role="status">
      {labels[state]}
    </span>
  )
}
