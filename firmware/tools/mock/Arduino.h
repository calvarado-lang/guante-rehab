#ifndef GUANTE_MOCK_ARDUINO_H
#define GUANTE_MOCK_ARDUINO_H

#include <stddef.h>
#include <stdint.h>

#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2
#define CHANGE 3
#define SERIAL_8N1 0
#define IRAM_ATTR

typedef uint8_t byte;

class HardwareSerial {
 public:
  void begin(uint32_t, uint32_t = SERIAL_8N1, int = -1, int = -1) {}
  size_t write(const uint8_t *, size_t length) { return length; }
  size_t write(uint8_t) { return 1u; }
  int available() { return 0; }
  int read() { return -1; }
  void print(const char *) {}
  void println() {}
  void println(const char *) {}
  template <typename T> void print(T) {}
  template <typename T> void print(T, uint8_t) {}
  template <typename T> void println(T) {}
};

extern HardwareSerial Serial;
extern HardwareSerial Serial1;
extern HardwareSerial Serial2;

inline void pinMode(uint8_t, uint8_t) {}
inline void digitalWrite(uint8_t, uint8_t) {}
inline int digitalRead(uint8_t) { return LOW; }
inline int analogRead(uint8_t) { return 2048; }
inline void analogReadResolution(uint8_t) {}
inline uint32_t millis() { return 0u; }
inline bool ledcAttach(uint8_t, uint32_t, uint8_t) { return true; }
inline bool ledcWrite(uint8_t, uint32_t) { return true; }
inline bool ledcDetach(uint8_t) { return true; }
inline void attachInterruptArg(uint8_t, void (*)(void *), void *, int) {}
inline void noInterrupts() {}
inline void interrupts() {}

#endif
