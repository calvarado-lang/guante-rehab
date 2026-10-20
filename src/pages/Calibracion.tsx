import { useState } from 'react'
import type { Command } from '../ble/types'
import { STATUS_FLAGS } from '../ble/gattSpec'
import { getActiveTransport, useDeviceStore } from '../store/deviceStore'

interface CalibrationStep {
  number: string
  title: string
  description: string
  command: Command
  requiredFlag?: number
}

const steps: CalibrationStep[] = [
  {
    number: '01',
    title: 'EMG basal',
    description: 'Relaja la mano para registrar el nivel de reposo.',
    command: { type: 'CAL_EMG_BASELINE' },
  },
  {
    number: '02',
    title: 'EMG MVC',
    description: 'Realiza una contracción máxima de forma controlada.',
    command: { type: 'CAL_EMG_MVC' },
    requiredFlag: STATUS_FLAGS.EMG_OK,
  },
  {
    number: '03',
    title: 'Flex abierto',
    description: 'Mantén los dedos extendidos durante la medición.',
    command: { type: 'CAL_FLEX_OPEN' },
  },
  {
    number: '04',
    title: 'Flex cerrado',
    description: 'Cierra la mano para completar el rango de movimiento.',
    command: { type: 'CAL_FLEX_CLOSED' },
    requiredFlag: STATUS_FLAGS.CALIBRATED,
  },
]

function waitForFlag(flag: number, timeoutMs = 4000): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const check = () => {
      if ((useDeviceStore.getState().statusFlags & flag) === flag) {
        resolve()
        return
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('No se recibió la confirmación de calibración del firmware.'))
        return
      }
      globalThis.setTimeout(check, 100)
    }
    check()
  })
}

export function Calibracion() {
  const connectionState = useDeviceStore((state) => state.connectionState)
  const statusFlags = useDeviceStore((state) => state.statusFlags)
  const [completed, setCompleted] = useState<boolean[]>([false, false, false, false])
  const [runningStep, setRunningStep] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const isCalibrated = (statusFlags & STATUS_FLAGS.CALIBRATED) === STATUS_FLAGS.CALIBRATED
  const completedCount = isCalibrated ? steps.length : completed.filter(Boolean).length

  const runStep = async (index: number) => {
    const transport = getActiveTransport()
    if (connectionState !== 'conectado' || transport === undefined) {
      setErrorMessage('Conecta el guante antes de calibrar.')
      return
    }
    setRunningStep(index)
    setErrorMessage(null)
    try {
      const step = steps[index]
      await transport.sendCommand(step.command)
      if (step.requiredFlag !== undefined) {
        await waitForFlag(step.requiredFlag)
      }
      setCompleted((current) => current.map((value, stepIndex) => stepIndex === index ? true : value))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No fue posible completar el paso.')
    } finally {
      setRunningStep(null)
    }
  }

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Preparación</p>
          <h2>Calibración</h2>
        </div>
        <span className={completedCount === steps.length ? 'status-pill status-conectado' : 'status-pill status-idle'}>
          {completedCount === steps.length ? 'Calibrado' : 'Pendiente'}
        </span>
      </div>

      <article className="card">
        <p className="progress-label">Progreso · {completedCount} de {steps.length} pasos</p>
        <div className="progress-track"><span style={{ width: `${(completedCount / steps.length) * 100}%` }} /></div>
        <p className="muted calibration-intro">
          Completa la calibración para habilitar el inicio de una sesión.
        </p>
      </article>

      {errorMessage !== null && <p className="error-message" role="alert">{errorMessage}</p>}

      <div className="step-list">
        {steps.map((step, index) => (
          <article className="card step-card" key={step.number}>
            <span className="step-number">{step.number}</span>
            <div>
              <h3>{step.title}</h3>
              <p className="muted">{step.description}</p>
              {step.requiredFlag !== undefined && <span className="step-confirmation">Confirmación por estado del dispositivo</span>}
            </div>
            <button
              className={completed[index] ? 'secondary-button step-button' : 'primary-button step-button'}
              type="button"
              onClick={() => void runStep(index)}
              disabled={runningStep !== null}
            >
              {runningStep === index ? 'Midiendo…' : completed[index] ? 'Repetir' : 'Iniciar'}
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}
