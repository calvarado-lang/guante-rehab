#ifndef GUANTE_CONFIG_H
#define GUANTE_CONFIG_H

#include <stdint.h>

// Diagnostic output is USB Serial only; it never drives motors or runs in an ISR.
#define GUANTE_SERIAL_DEBUG 1

namespace guante {

static const uint8_t FINGER_COUNT = 5;
static const uint8_t BLE_SENSOR_PACKET_LEN = 18;
static const uint8_t BLE_MOTOR_PACKET_LEN = 20;
static const uint8_t BLE_STATUS_PACKET_LEN = 4;

// Safety values that still require validation on the physical bench.
static const float VBAT_VALID_MAX_V = 8.8f;       // PROVISIONAL
static const float VBAT_CRITICAL_MIN_V = 6.4f;    // PROVISIONAL
static const float VBAT_FULL_V = 8.4f;             // PROVISIONAL
static const float VBAT_CAL_GAIN = 1.0f;           // PROVISIONAL
static const uint32_t VBAT_MAX_AGE_MS = 250u;      // PROVISIONAL
static const uint32_t HEARTBEAT_TIMEOUT_MS = 1250u; // PROVISIONAL
static const uint32_t NODE_A_TIMEOUT_MS = 250u;    // PROVISIONAL
static const uint32_t NODE_C_TIMEOUT_MS = 250u;    // PROVISIONAL
static const uint32_t CLUTCH_SETTLE_MS = 300u;     // PROVISIONAL
static const uint32_t SENSOR_PERIOD_MS = 20u;
static const uint32_t MOTOR_PERIOD_MS = 40u;
static const uint32_t SERIAL_DEBUG_PERIOD_MS = 250u;
static const uint32_t UART_BAUD = 115200u;
static const uint32_t PWM_FREQUENCY_HZ = 20000u;   // PROVISIONAL
static const uint8_t PWM_RESOLUTION_BITS = 12u;

static const uint8_t BENCH_MAX_DUTY_PERCENT = 15u; // PROVISIONAL
static const uint32_t BENCH_MAX_MS = 250u;          // PROVISIONAL

static const uint16_t ADC_RAW_MIN_VALID = 1u;
static const uint16_t ADC_RAW_MAX_VALID = 4094u;
static const uint16_t MIN_FLEX_SPAN = 100u;         // PROVISIONAL
static const uint16_t MIN_EMG_SPAN = 20u;           // PROVISIONAL

static const uint16_t CALIBRATION_MAGIC = 0x474Cu;
static const uint16_t CALIBRATION_FORMAT_VERSION = 1u;

enum DeviceState : uint8_t {
  STATE_IDLE = 0,
  STATE_CALIBRATING = 1,
  STATE_PASSIVE = 2,
  STATE_ASSISTED = 3,
  STATE_ADAPTIVE = 4,
  STATE_SAFE_STOP = 5
};

enum ErrorCode : uint8_t {
  ERR_NONE = 0,
  ERR_INVALID_COMMAND = 1,
  ERR_NOT_CALIBRATED = 2,
  ERR_HEARTBEAT_LOST = 3,
  ERR_FLEX_INVALID = 4,
  ERR_EMG_INVALID = 5,
  ERR_FSR_INVALID = 6,
  ERR_ENCODER_UART_INVALID = 7,
  ERR_OVERCURRENT = 8,
  ERR_OVERTEMPERATURE = 9,
  ERR_BATTERY_CRITICAL = 10,
  ERR_MECHANICAL_LIMIT = 11,
  ERR_DRIVER = 12,
  ERR_CALIBRATION_CORRUPT = 13,
  ERR_STARTUP = 14,
  ERR_STALL = 16
};

enum StatusFlag : uint16_t {
  FLAG_CALIBRATED = 0x0001u,
  FLAG_EMG_OK = 0x0002u,
  FLAG_MOTORS_ENABLED = 0x0004u,
  FLAG_LOW_BATTERY = 0x0008u
};

enum Opcode : uint8_t {
  OP_SET_MODE = 0x01,
  OP_SET_ASSIST_LEVEL = 0x02,
  OP_START = 0x03,
  OP_STOP = 0x04,
  OP_ESTOP = 0x05,
  OP_CAL_EMG_BASELINE = 0x06,
  OP_CAL_EMG_MVC = 0x07,
  OP_CAL_FLEX_OPEN = 0x08,
  OP_CAL_FLEX_CLOSED = 0x09,
  OP_HEARTBEAT = 0x0Au
};

} // namespace guante

#endif
