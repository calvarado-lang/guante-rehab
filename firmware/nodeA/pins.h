#ifndef NODE_A_PINS_H
#define NODE_A_PINS_H

#include <stdint.h>

// These are GPIO numbers, not physical header positions. On ESP32-S3-Zero,
// physical pin 3 is 3V3 and is intentionally never used here.
// PROVISIONAL: verify every signal against the electrical schematic.
static const uint8_t FLEX_PINS[5] = {1u, 2u, 4u, 5u, 6u};
static const uint8_t EMG_PIN = 7u;
static const uint8_t FSR_PIN = 8u;
static const uint8_t VBAT_PIN = 15u;
static const uint8_t CLUTCH_SERVO_PIN = 16u;

// A <-> B UART pins are provisional and must be confirmed with the schematic.
static const uint8_t NODE_A_UART_RX = 44u;
static const uint8_t NODE_A_UART_TX = 43u;
static const float VBAT_DIVIDER_RATIO = 2.0f; // PROVISIONAL
static const float VBAT_CAL_GAIN = 1.0f;      // PROVISIONAL

#endif
