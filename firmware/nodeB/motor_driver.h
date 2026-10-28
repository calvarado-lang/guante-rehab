#ifndef GUANTE_MOTOR_DRIVER_H
#define GUANTE_MOTOR_DRIVER_H

#include <Arduino.h>
#include "guante_config.h"
#include "pins.h"

class MotorDriver {
 public:
  MotorDriver() : initialized_(false) {}

  bool begin() {
    initialized_ = false;
    pinMode(MOTOR_STBY_PIN, OUTPUT);
    digitalWrite(MOTOR_STBY_PIN, LOW);
    for (uint8_t i = 0u; i < guante::FINGER_COUNT; ++i) {
      pinMode(MOTOR_PINS[i].in1, OUTPUT);
      pinMode(MOTOR_PINS[i].in2, OUTPUT);
      digitalWrite(MOTOR_PINS[i].in1, LOW);
      digitalWrite(MOTOR_PINS[i].in2, LOW);
      if (!MOTOR_PWM_CONTROLLED) continue;
      if (!ledcAttach(MOTOR_PINS[i].pwm, guante::PWM_FREQUENCY_HZ,
                      guante::PWM_RESOLUTION_BITS)) {
        stopAll();
        return false;
      }
      ledcWrite(MOTOR_PINS[i].pwm, 0u);
    }
    if (!MOTOR_PWM_CONTROLLED) {
      // PWMA/PWMB are tied HIGH. Do not enable STBY because duty limiting is
      // unavailable and a nonzero command would be full-power motor drive.
      digitalWrite(MOTOR_STBY_PIN, LOW);
      return false;
    }
    initialized_ = true;
    return true;
  }

  bool initialized() const { return initialized_; }

  void stopAll() {
    // Safety order: power bridge LOW before any clutch release command.
    digitalWrite(MOTOR_STBY_PIN, LOW);
    for (uint8_t i = 0u; i < guante::FINGER_COUNT; ++i) {
      if (MOTOR_PWM_CONTROLLED) ledcWrite(MOTOR_PINS[i].pwm, 0u);
      digitalWrite(MOTOR_PINS[i].in1, LOW);
      digitalWrite(MOTOR_PINS[i].in2, LOW);
    }
  }

  void setStandby(bool enabled) {
    if (!initialized_) {
      digitalWrite(MOTOR_STBY_PIN, LOW);
      return;
    }
    digitalWrite(MOTOR_STBY_PIN, enabled ? HIGH : LOW);
  }

  void writeDuty(uint8_t motor, int16_t signedDutyPercent) {
    if (!initialized_ || motor >= guante::FINGER_COUNT) return;
    if (signedDutyPercent > 100) signedDutyPercent = 100;
    if (signedDutyPercent < -100) signedDutyPercent = -100;
    const uint32_t maxDuty = (1u << guante::PWM_RESOLUTION_BITS) - 1u;
    uint16_t magnitude = static_cast<uint16_t>(signedDutyPercent < 0
                                                    ? -signedDutyPercent
                                                    : signedDutyPercent);
    uint32_t duty = (maxDuty * magnitude) / 100u;
    if (signedDutyPercent > 0) {
      digitalWrite(MOTOR_PINS[motor].in1, HIGH);
      digitalWrite(MOTOR_PINS[motor].in2, LOW);
    } else if (signedDutyPercent < 0) {
      digitalWrite(MOTOR_PINS[motor].in1, LOW);
      digitalWrite(MOTOR_PINS[motor].in2, HIGH);
    } else {
      digitalWrite(MOTOR_PINS[motor].in1, LOW);
      digitalWrite(MOTOR_PINS[motor].in2, LOW);
    }
    ledcWrite(MOTOR_PINS[motor].pwm, duty);
  }

 private:
  bool initialized_;
};

#endif
