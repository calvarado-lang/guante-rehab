#include <Arduino.h>

#include "../../common/guante_protocol.h"
#include "../../nodeB/pins.h"

HardwareSerial &nodeA = Serial1;
HardwareSerial &nodeC = Serial2;
// Link test wiring supplied for this build: C GPIO8 TX -> B GPIO10 RX.
static const int8_t LINK_C_RX_PIN = 10;
static const int8_t LINK_C_TX_PIN = -1; // receive-only test
guante::FrameParser parserA;
guante::FrameParser parserC;
uint32_t receivedA = 0u;
uint32_t receivedC = 0u;
uint32_t lastAFrameMs = 0u;
uint32_t lastCFrameMs = 0u;

static void printSensors(const guante::UartFrame &frame) {
  if (frame.type != guante::FRAME_SENSORS || frame.length < 24u) return;
  ++receivedA;
  lastAFrameMs = millis();
  Serial.print("[B-LINK] RX A #");
  Serial.print(receivedA);
  Serial.print(" seq=");
  Serial.print(guante::readLe16(frame.payload));
  Serial.print(" flex=");
  for (uint8_t i = 0u; i < guante::FINGER_COUNT; ++i) {
    if (i > 0u) Serial.print(',');
    Serial.print(guante::readLe16(frame.payload + 2u + i * 2u));
  }
  Serial.print(" emg=");
  Serial.print(guante::readLe16(frame.payload + 12));
  Serial.print(" fsr=");
  Serial.print(guante::readLe16(frame.payload + 14));
  Serial.print(" battery_mV=");
  Serial.println(guante::readLe16(frame.payload + 22));
}

static void printEncoders(const guante::UartFrame &frame) {
  if (frame.type != guante::FRAME_ENCODERS ||
      frame.length != guante::BLE_MOTOR_PACKET_LEN) return;
  ++receivedC;
  lastCFrameMs = millis();
  Serial.print("[B-LINK] RX C #");
  Serial.print(receivedC);
  Serial.print(" enc=");
  for (uint8_t i = 0u; i < guante::FINGER_COUNT; ++i) {
    if (i > 0u) Serial.print(',');
    Serial.print(guante::readLe32Signed(frame.payload + i * 4u));
  }
  Serial.println();
}

void setup() {
  Serial.begin(115200);
  nodeA.begin(guante::UART_BAUD, SERIAL_8N1, NODE_B_UART_A_RX, NODE_B_UART_A_TX);
  nodeC.begin(guante::UART_BAUD, SERIAL_8N1, LINK_C_RX_PIN, LINK_C_TX_PIN);
  Serial.println("[B-LINK] inicio UART; STBY, LEDC y motores permanecen apagados");
}

void loop() {
  guante::UartFrame frame;
  while (nodeA.available() > 0) {
    if (parserA.feed(static_cast<uint8_t>(nodeA.read()), frame)) printSensors(frame);
  }
  while (nodeC.available() > 0) {
    if (parserC.feed(static_cast<uint8_t>(nodeC.read()), frame)) printEncoders(frame);
  }

  static uint32_t lastReportMs = 0u;
  const uint32_t now = millis();
  if (now - lastReportMs >= 1000u) {
    lastReportMs = now;
    const bool aOk = receivedA > 0u && now - lastAFrameMs < 1000u;
    const bool cOk = receivedC > 0u && now - lastCFrameMs < 1000u;
    Serial.print("[B-LINK] A=");
    Serial.print(aOk ? "OK" : "ESPERA");
    Serial.print(" C=");
    Serial.println(cOk ? "OK" : "ESPERA");
  }
}
