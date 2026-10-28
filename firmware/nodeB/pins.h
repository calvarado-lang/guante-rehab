#ifndef NODE_B_PINS_H
#define NODE_B_PINS_H

#include <stdint.h>

struct MotorPins {
  uint8_t pwm;
  uint8_t in1;
  uint8_t in2;
};

// These are GPIO numbers, not physical header positions. GPIO3 is intentionally
// unused. PWMA/PWMB of the TB6612 boards are hardwired to 3.3 V, so no PWM GPIO
// is assigned until the driver wiring is changed to permit a duty limit.
static const MotorPins MOTOR_PINS[5] = {
    {0xFFu, 1u, 2u}, {0xFFu, 4u, 5u}, {0xFFu, 6u, 7u},
    {0xFFu, 8u, 9u}, {0xFFu, 11u, 13u}};
static const uint8_t MOTOR_STBY_PIN = 12u;
static const bool MOTOR_PWM_CONTROLLED = false;
static const uint8_t PHYSICAL_ESTOP_PIN = 18u; // Active LOW, provisional.

static const uint8_t NODE_B_UART_A_RX = 44u;
static const uint8_t NODE_B_UART_A_TX = 43u;
static const int8_t NODE_B_UART_C_RX = 10;
static const int8_t NODE_B_UART_C_TX = -1; // C -> B only in this phase.

static const uint32_t GUANTE_BLE_PASSKEY = 123456u; // EXAMPLE ONLY; request final value.

// Leave SSID empty to start an isolated access point. In that mode connect the
// phone/tablet to "Guante-Rehab" and open http://192.168.4.1 in the PWA.
static const char GUANTE_WIFI_SSID[] = "";
static const char GUANTE_WIFI_PASSWORD[] = "";
static const char GUANTE_WIFI_AP_SSID[] = "Guante-Rehab";
static const char GUANTE_WIFI_AP_PASSWORD[] = "guante1234";

#endif
