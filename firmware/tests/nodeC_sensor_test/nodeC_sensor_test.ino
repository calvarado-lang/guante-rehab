#include <Arduino.h>

#include "../../common/guante_protocol.h"
#include "../../nodeC/pins.h"

struct EncoderChannel {
  volatile uint32_t *count;
  uint8_t pinA;
  uint8_t pinB;
  int8_t sign;
  volatile uint8_t state;
};

// Pin map supplied for the ESP32-C3 Mini bench module.
static const uint8_t TEST_ENCODER_A_PINS[5] = {0u, 3u, 5u, 7u, 20u};
static const uint8_t TEST_ENCODER_B_PINS[5] = {1u, 4u, 6u, 10u, 21u};
static const int8_t TEST_UART_RX_PIN = -1;
static const int8_t TEST_UART_TX_PIN = 8;

volatile uint32_t rawCounts[5] = {0u, 0u, 0u, 0u, 0u};
EncoderChannel channels[5];
static const int8_t TRANSITIONS[16] = {
    0, -1, 1, 0, 1, 0, 0, -1, -1, 0, 0, 1, 0, 1, -1, 0};
HardwareSerial &nodeB = Serial1;

void IRAM_ATTR encoderTestIsr(void *argument) {
  EncoderChannel *channel = static_cast<EncoderChannel *>(argument);
  if (channel == nullptr) return;
  const uint8_t next = static_cast<uint8_t>((digitalRead(channel->pinA) << 1) |
                                             digitalRead(channel->pinB));
  const uint8_t index = static_cast<uint8_t>(((channel->state & 0x03u) << 2) | next);
  const int8_t transition = TRANSITIONS[index];
  if (transition > 0) *channel->count += static_cast<uint32_t>(channel->sign);
  if (transition < 0) *channel->count -= static_cast<uint32_t>(channel->sign);
  channel->state = next;
}

void setup() {
  Serial.begin(115200);
  nodeB.begin(guante::UART_BAUD, SERIAL_8N1, TEST_UART_RX_PIN, TEST_UART_TX_PIN);
  for (uint8_t i = 0u; i < 5u; ++i) {
    channels[i] = {&rawCounts[i], TEST_ENCODER_A_PINS[i], TEST_ENCODER_B_PINS[i], 1, 0u};
    pinMode(channels[i].pinA, INPUT_PULLUP);
    pinMode(channels[i].pinB, INPUT_PULLUP);
    channels[i].state = static_cast<uint8_t>((digitalRead(channels[i].pinA) << 1) |
                                              digitalRead(channels[i].pinB));
    attachInterruptArg(channels[i].pinA, encoderTestIsr, &channels[i], CHANGE);
    attachInterruptArg(channels[i].pinB, encoderTestIsr, &channels[i], CHANGE);
  }
  Serial.println("[C-LINK] inicio encoder + UART hacia B; la ISR no imprime");
}

void loop() {
  static uint32_t lastMs = 0u;
  const uint32_t now = millis();
  if (now - lastMs < 250u) return;
  lastMs = now;
  int32_t counts[5];
  noInterrupts();
  for (uint8_t i = 0u; i < 5u; ++i) counts[i] = static_cast<int32_t>(rawCounts[i]);
  interrupts();
  uint8_t payload[guante::BLE_MOTOR_PACKET_LEN];
  guante::packMotors(payload, counts);
  uint8_t wire[70];
  const uint8_t wireLength = guante::buildFrame(
      wire, sizeof(wire), guante::FRAME_ENCODERS, payload, sizeof(payload));
  if (wireLength > 0u) nodeB.write(wire, wireLength);

  Serial.print("[C-LINK] TX enc=");
  for (uint8_t i = 0u; i < 5u; ++i) {
    if (i > 0u) Serial.print(',');
    Serial.print(counts[i]);
  }
  Serial.println();
}
