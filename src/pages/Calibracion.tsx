import { useState } from 'react'
import type { Command } from '../ble/types'
import { STATUS_FLAGS } from '../ble/gattSpec'
import { getActiveTransport, useDeviceStore } from '../store/deviceStore'
import { isRemoteApiConfigured, saveRemoteCalibration } from '../api/profiles'
import { saveCalibration } from '../db/profiles'
import { useProfileStore } from '../store/profileStore'
import {
  averageEmg,
  averageFlex,
  buildCalibrationRecord,
  captureSensorWindow,
  type CalibrationMeasurements,
} from '../utils/calibration'

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

function newCalibrationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `calibration-${Date.now()}`
}

export function Calibracion() {
  const connectionState = useDeviceStore((state) => state.connectionState)
  const statusFlags = useDeviceStore((state) => state.statusFlags)
  const profileId = useProfileStore((state) => state.selectedProfileId)
  const [completed, setCompleted] = useState<boolean[]>([false, false, false, false])
  const [runningStep, setRunningStep] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [measurements, setMeasurements] = useState<CalibrationMeasurements>({
    emgBaseline: null,
    emgMvc: null,
    flexOpen: null,
    flexClosed: null,
  })
  const isCalibrated = (statusFlags & STATUS_FLAGS.CALIBRATED) === STATUS_FLAGS.CALIBRATED
  const completedCount = isCalibrated ? steps.length : completed.filter(Boolean).length

  const runStep = async (index: number) => {
    const transport = getActiveTransport()
    if (connectionState !== 'conectado' || transport === undefined) {
      setErrorMessage('Conecta el guante antes de calibrar.')
      return
    }
    if (profileId === null) {
      setErrorMessage('Selecciona un perfil antes de calibrar.')
      return
    }
    setRunningStep(index)
    setErrorMessage(null)
    setSavedMessage(null)
    try {
      const step = steps[index]
      await transport.sendCommand(step.command)
      if (step.requiredFlag !== undefined) {
        await waitForFlag(step.requiredFlag)
      }
      const sensorWindow = captureSensorWindow()
      const nextMeasurements: CalibrationMeasurements = {
        ...measurements,
        emgBaseline: index === 0 ? averageEmg(sensorWindow) : measurements.emgBaseline,
        emgMvc: index === 1 ? averageEmg(sensorWindow) : measurements.emgMvc,
        flexOpen: index === 2 ? averageFlex(sensorWindow) : measurements.flexOpen,
        flexClosed: index === 3 ? averageFlex(sensorWindow) : measurements.flexClosed,
      }
      setMeasurements(nextMeasurements)
      setCompleted((current) => current.map((value, stepIndex) => stepIndex === index ? true : value))
      if (index === steps.length - 1) {
        const calibration = buildCalibrationRecord(
          profileId,
          newCalibrationId(),
          nextMeasurements,
        )
        await saveCalibration(calibration)
        if (isRemoteApiConfigured()) {
          try {
            const remoteCalibration = await saveRemoteCalibration(profileId, calibration)
            await saveCalibration(remoteCalibration)
            setSavedMessage('Calibración guardada para el perfil y sincronizada con la nube.')
          } catch {
            setSavedMessage('Calibración guardada localmente. No fue posible sincronizarla con la nube.')
          }
        } else {
          setSavedMessage('Calibración guardada para el perfil.')
        }
      }
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

      {profileId === null && <p className="error-message" role="alert">Selecciona un perfil en Perfiles para guardar la calibración.</p>}
      {errorMessage !== null && <p className="error-message" role="alert">{errorMessage}</p>}
      {savedMessage !== null && <p className="success-message" role="status">{savedMessage}</p>}

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
