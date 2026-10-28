#ifndef NODE_C_PINS_H
#define NODE_C_PINS_H

#include <stdint.h>

// ESP32-C3 Mini wiring supplied for the bench build.
static const uint8_t ENCODER_A_PINS[5] = {0u, 3u, 5u, 7u, 20u};
static const uint8_t ENCODER_B_PINS[5] = {1u, 4u, 6u, 10u, 21u};
static const int8_t ENCODER_SIGN[5] = {1, 1, 1, 1, 1}; // PROVISIONAL: measure direction.
static const int8_t NODE_C_UART_RX = -1; // C -> B only in this phase.
static const int8_t NODE_C_UART_TX = 8;

#endif
