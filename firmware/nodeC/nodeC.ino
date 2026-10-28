#include <Arduino.h>

#include "guante_config.h"
#include "guante_protocol.h"
#include "pins.h"

struct EncoderChannel {
  volatile uint32_t *count;
  uint8_t pinA;
  uint8_t pinB;
  int8_t sign;
  volatile uint8_t state;
};

volatile uint32_t encoderRawCounts[guante::FINGER_COUNT] = {0u, 0u, 0u, 0u, 0u};
EncoderChannel channels[guante::FINGER_COUNT];
HardwareSerial &nodeB = Serial1;

static const int8_t QUADRATURE_TRANSITIONS[16] = {
    0, -1, 1, 0,
    1, 0, 0, -1,
    -1, 0, 0, 1,
    0, 1, -1, 0};

void IRAM_ATTR encoderIsr(void *argument) {
  EncoderChannel *channel = static_cast<EncoderChannel *>(argument);
  if (channel == nullptr) return;
  const uint8_t nextState = static_cast<uint8_t>((digitalRead(channel->pinA) << 1) |
                                                  digitalRead(channel->pinB));
  const uint8_t index = static_cast<uint8_t>(((channel->state & 0x03u) << 2) |
                                              (nextState & 0x03u));
  const int8_t transition = QUADRATURE_TRANSITIONS[index];
  if (transition > 0) {
    *channel->count += static_cast<uint32_t>(channel->sign);
  } else if (transition < 0) {
    *channel->count -= static_cast<uint32_t>(channel->sign);
  }
  channel->state = nextState;
}

static void writeUartFrame(const int32_t counts[guante::FINGER_COUNT]) {
  uint8_t payload[guante::BLE_MOTOR_PACKET_LEN];
  guante::packMotors(payload, counts);
  uint8_t wire[70];
  uint8_t wireLength = guante::buildFrame(wire, sizeof(wire), guante::FRAME_ENCODERS,
                                          payload, sizeof(payload));
  if (wireLength > 0u) nodeB.write(wire, wireLength);
}

void setup() {
  Serial.begin(115200);
  nodeB.begin(guante::UART_BAUD, SERIAL_8N1, NODE_C_UART_RX, NODE_C_UART_TX);
  for (uint8_t i = 0u; i < guante::FINGER_COUNT; ++i) {
    channels[i].count = &encoderRawCounts[i];
    channels[i].pinA = ENCODER_A_PINS[i];
    channels[i].pinB = ENCODER_B_PINS[i];
    channels[i].sign = ENCODER_SIGN[i];
    pinMode(channels[i].pinA, INPUT_PULLUP);
    pinMode(channels[i].pinB, INPUT_PULLUP);
    channels[i].state = static_cast<uint8_t>((digitalRead(channels[i].pinA) << 1) |
                                              digitalRead(channels[i].pinB));
    attachInterruptArg(channels[i].pinA, encoderIsr, &channels[i], CHANGE);
    attachInterruptArg(channels[i].pinB, encoderIsr, &channels[i], CHANGE);
  }
}

void loop() {
  static uint32_t lastPublishMs = 0u;
  static uint32_t lastDebugMs = 0u;
  const uint32_t now = millis();
  if (now - lastPublishMs >= guante::MOTOR_PERIOD_MS) {
    lastPublishMs = now;
    int32_t counts[guante::FINGER_COUNT];
    noInterrupts();
    for (uint8_t i = 0u; i < guante::FINGER_COUNT; ++i)
      counts[i] = static_cast<int32_t>(encoderRawCounts[i]);
    interrupts();
    writeUartFrame(counts);

#if GUANTE_SERIAL_DEBUG
    if (now - lastDebugMs >= guante::SERIAL_DEBUG_PERIOD_MS) {
      lastDebugMs = now;
      Serial.print("[C] enc=");
      for (uint8_t i = 0u; i < guante::FINGER_COUNT; ++i) {
        if (i > 0u) Serial.print(',');
        Serial.print(counts[i]);
      }
      Serial.println();
    }
#endif
  }
}
