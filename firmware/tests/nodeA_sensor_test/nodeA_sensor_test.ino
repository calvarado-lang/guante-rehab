#include <Arduino.h>

#include "../../common/guante_protocol.h"
#include "../../nodeA/pins.h"

HardwareSerial &nodeB = Serial1;
uint16_t sensorSequence = 0u;

static uint16_t readAdc(uint8_t pin) {
  int value = analogRead(pin);
  if (value < 0) return 0u;
  if (value > 4095) return 4095u;
  return static_cast<uint16_t>(value);
}

static float readBatteryVolts(uint16_t raw) {
  const float adcVolts = static_cast<float>(raw) * 3.3f / 4095.0f;
  return adcVolts * VBAT_DIVIDER_RATIO * VBAT_CAL_GAIN;
}

static void sendSensorFrame(const uint16_t flex[guante::FINGER_COUNT],
                            uint16_t emg, uint16_t fsr, uint16_t vbatRaw) {
  uint8_t payload[24];
  guante::packSensors(payload, sensorSequence++, flex, emg, fsr,
                      guante::STATE_SAFE_STOP, 0u);
  payload[18] = 1u;
  payload[19] = static_cast<uint8_t>(guante::ERR_NONE);
  guante::writeLe16(payload + 20, 0u);
  const float batteryVolts = readBatteryVolts(vbatRaw);
  const uint16_t batteryMv = batteryVolts <= 0.0f
                                 ? 0u
                                 : static_cast<uint16_t>(batteryVolts * 1000.0f);
  guante::writeLe16(payload + 22, batteryMv);

  uint8_t wire[70];
  const uint8_t wireLength = guante::buildFrame(
      wire, sizeof(wire), guante::FRAME_SENSORS, payload, sizeof(payload));
  if (wireLength > 0u) nodeB.write(wire, wireLength);
}

void setup() {
  Serial.begin(115200);
  nodeB.begin(guante::UART_BAUD, SERIAL_8N1, NODE_A_UART_RX, NODE_A_UART_TX);
  analogReadResolution(12);
  for (uint8_t i = 0u; i < 5u; ++i) pinMode(FLEX_PINS[i], INPUT);
  pinMode(EMG_PIN, INPUT);
  pinMode(FSR_PIN, INPUT);
  pinMode(VBAT_PIN, INPUT);
  Serial.println("[A-LINK] inicio ADC + UART hacia B; no hay clutch ni motores");
}

void loop() {
  static uint32_t lastMs = 0u;
  const uint32_t now = millis();
  if (now - lastMs < 250u) return;
  lastMs = now;

  uint16_t flex[guante::FINGER_COUNT];
  for (uint8_t i = 0u; i < guante::FINGER_COUNT; ++i) {
    flex[i] = readAdc(FLEX_PINS[i]);
  }
  const uint16_t emg = readAdc(EMG_PIN);
  const uint16_t fsr = readAdc(FSR_PIN);
  const uint16_t vbatRaw = readAdc(VBAT_PIN);
  sendSensorFrame(flex, emg, fsr, vbatRaw);

  Serial.print("[A-LINK] TX seq=");
  Serial.print(static_cast<uint16_t>(sensorSequence - 1u));
  Serial.print(" flex=");
  for (uint8_t i = 0u; i < 5u; ++i) {
    if (i > 0u) Serial.print(',');
    Serial.print(flex[i]);
  }
  Serial.print(" emg=");
  Serial.print(emg);
  Serial.print(" fsr=");
  Serial.print(fsr);
  Serial.print(" vbat_raw=");
  Serial.println(vbatRaw);
}
