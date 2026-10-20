export const GATT_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'

const GATT_BASE_UUID = '6e4000'
const GATT_SUFFIX = '-b5a3-f393-e0a9-e50e24dcca9e'

export const GATT_CHARACTERISTICS = {
  telemetrySensors: `${GATT_BASE_UUID}02${GATT_SUFFIX}`,
  telemetryMotors: `${GATT_BASE_UUID}03${GATT_SUFFIX}`,
  status: `${GATT_BASE_UUID}04${GATT_SUFFIX}`,
  command: `${GATT_BASE_UUID}05${GATT_SUFFIX}`,
  config: `${GATT_BASE_UUID}06${GATT_SUFFIX}`,
} as const

export const PACKET_LENGTHS = {
  sensors: 18,
  motors: 20,
  status: 4,
} as const

export const TELEMETRY_INTERVAL_MS = 20
export const HEARTBEAT_INTERVAL_MS = 500

export const OPCODES = {
  SET_MODE: 0x01,
  SET_ASSIST_LEVEL: 0x02,
  START: 0x03,
  STOP: 0x04,
  ESTOP: 0x05,
  CAL_EMG_BASELINE: 0x06,
  CAL_EMG_MVC: 0x07,
  CAL_FLEX_OPEN: 0x08,
  CAL_FLEX_CLOSED: 0x09,
  HEARTBEAT: 0x0a,
} as const

export const STATUS_FLAGS = {
  CALIBRATED: 1 << 0,
  EMG_OK: 1 << 1,
  MOTORS_ENABLED: 1 << 2,
  LOW_BATTERY: 1 << 3,
} as const

export const DEVICE_STATES = {
  IDLE: 0,
  CALIBRATING: 1,
  PASSIVE: 2,
  ASSISTED: 3,
  ADAPTIVE: 4,
  SAFE_STOP: 5,
} as const

export type DeviceState = (typeof DEVICE_STATES)[keyof typeof DEVICE_STATES]
export type Mode = 0 | 1 | 2 | 3 | 4
