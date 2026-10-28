#include <Arduino.h>
#include <Preferences.h>

#include "guante_config.h"
#include "guante_logic.h"
#include "guante_protocol.h"
#include "pins.h"

HardwareSerial &nodeB = Serial1;
Preferences calibrationNvs;
guante::Calibration calibration;
guante::FrameParser commandParser;
uint16_t sensorSequence = 0u;
guante::ErrorCode nodeError = guante::ERR_NONE;
bool servoReady = false;

static uint16_t readAdc(uint8_t pin) {
  int value = analogRead(pin);
  if (value < 0) return 0u;
  if (value > 4095) return 4095u;
  return static_cast<uint16_t>(value);
}

static float readBatteryVolts() {
  const uint16_t raw = readAdc(VBAT_PIN);
  const float adcVolts = static_cast<float>(raw) * 3.3f / 4095.0f;
  return adcVolts * VBAT_DIVIDER_RATIO * VBAT_CAL_GAIN;
}

static uint8_t batteryPercent(float volts) {
  if (volts <= guante::VBAT_CRITICAL_MIN_V) return 0u;
  if (volts >= guante::VBAT_FULL_V) return 100u;
  const float ratio = (volts - guante::VBAT_CRITICAL_MIN_V) /
                      (guante::VBAT_FULL_V - guante::VBAT_CRITICAL_MIN_V);
  return static_cast<uint8_t>(ratio * 100.0f);
}

static void writeUartFrame(uint8_t type, const uint8_t *payload, uint8_t length) {
  uint8_t wire[70];
  uint8_t wireLength = guante::buildFrame(wire, sizeof(wire), type, payload, length);
  if (wireLength > 0u) nodeB.write(wire, wireLength);
}

static void setClutchLoose() {
  if (!servoReady) return;
  const uint32_t duty = (500u * (1u << 14)) / 20000u; // PROVISIONAL pulse width.
  ledcWrite(CLUTCH_SERVO_PIN, duty);
}

static void setClutchCoupled() {
  if (!servoReady) return;
  const uint32_t duty = (2200u * (1u << 14)) / 20000u; // PROVISIONAL pulse width.
  ledcWrite(CLUTCH_SERVO_PIN, duty);
}

static bool saveCalibration() {
  if (!calibration.complete()) return false;
  guante::CalibrationBlob blob;
  calibration.exportBlob(blob);
  return calibrationNvs.putBytes("record", &blob, sizeof(blob)) == sizeof(blob);
}

static void loadCalibration() {
  const size_t length = calibrationNvs.getBytesLength("record");
  if (length == 0u) {
    nodeError = guante::ERR_NOT_CALIBRATED;
    return;
  }
  uint8_t raw[sizeof(guante::CalibrationBlob)];
  if (length != sizeof(raw) || calibrationNvs.getBytes("record", raw, sizeof(raw)) != sizeof(raw) ||
      guante::loadCalibrationBlob(raw, sizeof(raw), calibration) != guante::CAL_LOAD_OK) {
    calibration.clear();
    nodeError = guante::ERR_CALIBRATION_CORRUPT;
    return;
  }
  nodeError = calibration.complete() ? guante::ERR_NONE : guante::ERR_NOT_CALIBRATED;
}

static void captureCalibration(uint8_t opcode) {
  uint16_t flex[guante::FINGER_COUNT];
  for (uint8_t i = 0u; i < guante::FINGER_COUNT; ++i) flex[i] = readAdc(FLEX_PINS[i]);
  bool accepted = true;
  if (opcode == guante::OP_CAL_FLEX_OPEN) {
    accepted = calibration.setFlexOpen(flex);
  } else if (opcode == guante::OP_CAL_FLEX_CLOSED) {
    accepted = calibration.setFlexClosed(flex);
  } else if (opcode == guante::OP_CAL_EMG_BASELINE) {
    accepted = calibration.setEmgBaseline(readAdc(EMG_PIN));
  } else if (opcode == guante::OP_CAL_EMG_MVC) {
    accepted = calibration.setEmgMvc(readAdc(EMG_PIN));
  } else {
    return;
  }
  if (!accepted) {
    nodeError = (opcode == guante::OP_CAL_EMG_BASELINE || opcode == guante::OP_CAL_EMG_MVC)
                    ? guante::ERR_EMG_INVALID
                    : guante::ERR_FLEX_INVALID;
  } else if (calibration.complete()) {
    if (!saveCalibration()) {
      nodeError = guante::ERR_CALIBRATION_CORRUPT;
    } else {
      nodeError = guante::ERR_NONE;
    }
  } else {
    nodeError = guante::ERR_NOT_CALIBRATED;
  }
}

static void handleCommandFrame(const guante::UartFrame &frame) {
  if (frame.type == guante::FRAME_COMMAND && frame.length >= 1u) {
    captureCalibration(frame.payload[0]);
  } else if (frame.type == guante::FRAME_CLUTCH && frame.length == 1u) {
    // This command arrives from B's main loop, never from a BLE callback.
    if (frame.payload[0] == 0u) setClutchLoose();
    if (frame.payload[0] == 1u) setClutchCoupled();
  }
}

static void processUart() {
  guante::UartFrame frame;
  while (nodeB.available() > 0) {
    if (commandParser.feed(static_cast<uint8_t>(nodeB.read()), frame)) handleCommandFrame(frame);
  }
}

static void publishSensors(float batteryVolts) {
  static uint32_t lastDebugMs = 0u;
  uint16_t flex[guante::FINGER_COUNT];
  for (uint8_t i = 0u; i < guante::FINGER_COUNT; ++i) flex[i] = readAdc(FLEX_PINS[i]);
  const uint16_t emg = readAdc(EMG_PIN);
  const uint16_t fsr = readAdc(FSR_PIN);
  const uint8_t state = calibration.complete() ? guante::STATE_IDLE : guante::STATE_SAFE_STOP;
  const uint8_t pct = batteryPercent(batteryVolts);
  uint8_t payload[24];
  guante::packSensors(payload, sensorSequence++, flex, emg, fsr, state, pct);
  payload[18] = 1u; // quality: ADC acquisition completed.
  payload[19] = static_cast<uint8_t>(nodeError);
  uint16_t flags = 0u;
  if (calibration.complete()) flags |= guante::FLAG_CALIBRATED;
  if (calibration.emgValid()) flags |= guante::FLAG_EMG_OK;
  if (batteryVolts <= guante::VBAT_CRITICAL_MIN_V) flags |= guante::FLAG_LOW_BATTERY;
  guante::writeLe16(payload + 20, flags);
  uint16_t batteryMv = batteryVolts <= 0.0f ? 0u : static_cast<uint16_t>(batteryVolts * 1000.0f);
  guante::writeLe16(payload + 22, batteryMv);
  writeUartFrame(guante::FRAME_SENSORS, payload, sizeof(payload));

#if GUANTE_SERIAL_DEBUG
  const uint32_t now = millis();
  if (now - lastDebugMs >= guante::SERIAL_DEBUG_PERIOD_MS) {
    lastDebugMs = now;
    Serial.print("[A] flex=");
    for (uint8_t i = 0u; i < guante::FINGER_COUNT; ++i) {
      if (i > 0u) Serial.print(',');
      Serial.print(flex[i]);
    }
    Serial.print(" emg=");
    Serial.print(emg);
    Serial.print(" fsr=");
    Serial.print(fsr);
    Serial.print(" vbat=");
    Serial.print(batteryVolts, 3);
    Serial.print("V cal=");
    Serial.print(calibration.complete() ? 1 : 0);
    Serial.print(" err=");
    Serial.println(static_cast<uint8_t>(nodeError));
  }
#endif
}

void setup() {
  Serial.begin(115200);
  nodeB.begin(guante::UART_BAUD, SERIAL_8N1, NODE_A_UART_RX, NODE_A_UART_TX);
  analogReadResolution(12);
  for (uint8_t i = 0u; i < guante::FINGER_COUNT; ++i) pinMode(FLEX_PINS[i], INPUT);
  pinMode(EMG_PIN, INPUT);
  pinMode(FSR_PIN, INPUT);
  pinMode(VBAT_PIN, INPUT);
  servoReady = ledcAttach(CLUTCH_SERVO_PIN, 50u, 14u);
  setClutchLoose(); // Clutch must start loose.
  calibrationNvs.begin("guante-cal", false);
  loadCalibration();
  if (!servoReady) nodeError = guante::ERR_DRIVER;
}

void loop() {
  static uint32_t lastSensorsMs = 0u;
  processUart();
  const uint32_t now = millis();
  if (now - lastSensorsMs >= guante::SENSOR_PERIOD_MS) {
    lastSensorsMs = now;
    publishSensors(readBatteryVolts());
  }
}
