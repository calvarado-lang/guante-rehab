#ifndef GUANTE_PROTOCOL_H
#define GUANTE_PROTOCOL_H

#include "guante_config.h"
#include <stddef.h>
#include <stdint.h>
#include <string.h>

namespace guante {

static const uint8_t FRAME_SYNC_0 = 0xA5u;
static const uint8_t FRAME_SYNC_1 = 0x5Au;
static const uint8_t UART_MAX_PAYLOAD = 64u;

enum FrameType : uint8_t {
  FRAME_SENSORS = 0x10,
  FRAME_ENCODERS = 0x11,
  FRAME_COMMAND = 0x12,
  FRAME_CLUTCH = 0x13
};

struct UartFrame {
  uint8_t type;
  uint8_t length;
  uint8_t payload[UART_MAX_PAYLOAD];
};

inline uint16_t crc16CcittFalse(const uint8_t *data, size_t length) {
  uint16_t crc = 0xFFFFu;
  for (size_t i = 0; i < length; ++i) {
    crc ^= static_cast<uint16_t>(data[i]) << 8;
    for (uint8_t bit = 0; bit < 8u; ++bit) {
      crc = (crc & 0x8000u) ? static_cast<uint16_t>((crc << 1) ^ 0x1021u)
                              : static_cast<uint16_t>(crc << 1);
    }
  }
  return crc;
}

inline uint16_t readLe16(const uint8_t *p) {
  return static_cast<uint16_t>(p[0]) |
         static_cast<uint16_t>(static_cast<uint16_t>(p[1]) << 8);
}

inline int32_t readLe32Signed(const uint8_t *p) {
  uint32_t value = static_cast<uint32_t>(p[0]) |
                   (static_cast<uint32_t>(p[1]) << 8) |
                   (static_cast<uint32_t>(p[2]) << 16) |
                   (static_cast<uint32_t>(p[3]) << 24);
  int32_t result;
  memcpy(&result, &value, sizeof(result));
  return result;
}

inline void writeLe16(uint8_t *p, uint16_t value) {
  p[0] = static_cast<uint8_t>(value & 0xFFu);
  p[1] = static_cast<uint8_t>((value >> 8) & 0xFFu);
}

inline void writeLe32Signed(uint8_t *p, int32_t value) {
  uint32_t raw;
  memcpy(&raw, &value, sizeof(raw));
  p[0] = static_cast<uint8_t>(raw & 0xFFu);
  p[1] = static_cast<uint8_t>((raw >> 8) & 0xFFu);
  p[2] = static_cast<uint8_t>((raw >> 16) & 0xFFu);
  p[3] = static_cast<uint8_t>((raw >> 24) & 0xFFu);
}

inline uint8_t packSensors(uint8_t *out, uint16_t seq,
                           const uint16_t flex[FINGER_COUNT], uint16_t emg,
                           uint16_t fsr, uint8_t state, uint8_t batteryPct) {
  if (out == NULL || flex == NULL) return 0u;
  writeLe16(out + 0, seq);
  for (uint8_t i = 0; i < FINGER_COUNT; ++i) writeLe16(out + 2u + i * 2u, flex[i]);
  writeLe16(out + 12, emg);
  writeLe16(out + 14, fsr);
  out[16] = state;
  out[17] = batteryPct;
  return BLE_SENSOR_PACKET_LEN;
}

inline uint8_t packMotors(uint8_t *out, const int32_t counts[FINGER_COUNT]) {
  if (out == NULL || counts == NULL) return 0u;
  for (uint8_t i = 0; i < FINGER_COUNT; ++i) writeLe32Signed(out + i * 4u, counts[i]);
  return BLE_MOTOR_PACKET_LEN;
}

inline uint8_t packStatus(uint8_t *out, DeviceState state, ErrorCode error,
                          uint16_t flags) {
  if (out == NULL) return 0u;
  out[0] = static_cast<uint8_t>(state);
  out[1] = static_cast<uint8_t>(error);
  writeLe16(out + 2, flags);
  return BLE_STATUS_PACKET_LEN;
}

class FrameParser {
 public:
  FrameParser() : state_(WAIT_SYNC_0), type_(0u), length_(0u), index_(0u), crcLow_(0u) {}

  void reset() {
    state_ = WAIT_SYNC_0;
    type_ = length_ = index_ = crcLow_ = 0u;
  }

  bool feed(uint8_t byte, UartFrame &frame) {
    switch (state_) {
      case WAIT_SYNC_0:
        if (byte == FRAME_SYNC_0) state_ = WAIT_SYNC_1;
        return false;
      case WAIT_SYNC_1:
        if (byte == FRAME_SYNC_1) {
          state_ = READ_TYPE;
        } else if (byte == FRAME_SYNC_0) {
          state_ = WAIT_SYNC_1;
        } else {
          state_ = WAIT_SYNC_0;
        }
        return false;
      case READ_TYPE:
        type_ = byte;
        state_ = READ_LENGTH;
        return false;
      case READ_LENGTH:
        length_ = byte;
        if (length_ > UART_MAX_PAYLOAD) {
          reset();
        } else if (length_ == 0u) {
          state_ = READ_CRC_LOW;
        } else {
          index_ = 0u;
          state_ = READ_PAYLOAD;
        }
        return false;
      case READ_PAYLOAD:
        payload_[index_++] = byte;
        if (index_ >= length_) state_ = READ_CRC_LOW;
        return false;
      case READ_CRC_LOW:
        crcLow_ = byte;
        state_ = READ_CRC_HIGH;
        return false;
      case READ_CRC_HIGH: {
        uint8_t headerAndPayload[2u + UART_MAX_PAYLOAD];
        headerAndPayload[0] = type_;
        headerAndPayload[1] = length_;
        if (length_ > 0u) memcpy(headerAndPayload + 2, payload_, length_);
        uint16_t expected = crc16CcittFalse(headerAndPayload, 2u + length_);
        uint16_t received = static_cast<uint16_t>(crcLow_) |
                            static_cast<uint16_t>(static_cast<uint16_t>(byte) << 8);
        bool valid = expected == received;
        if (valid) {
          frame.type = type_;
          frame.length = length_;
          if (length_ > 0u) memcpy(frame.payload, payload_, length_);
        }
        reset();
        return valid;
      }
    }
    reset();
    return false;
  }

 private:
  enum State : uint8_t {
    WAIT_SYNC_0,
    WAIT_SYNC_1,
    READ_TYPE,
    READ_LENGTH,
    READ_PAYLOAD,
    READ_CRC_LOW,
    READ_CRC_HIGH
  };
  State state_;
  uint8_t type_;
  uint8_t length_;
  uint8_t index_;
  uint8_t crcLow_;
  uint8_t payload_[UART_MAX_PAYLOAD];
};

inline uint8_t buildFrame(uint8_t *out, size_t capacity, uint8_t type,
                          const uint8_t *payload, uint8_t length) {
  const size_t total = static_cast<size_t>(6u) + length;
  if (out == NULL || length > UART_MAX_PAYLOAD || capacity < total) return 0u;
  out[0] = FRAME_SYNC_0;
  out[1] = FRAME_SYNC_1;
  out[2] = type;
  out[3] = length;
  if (length > 0u && payload != NULL) memcpy(out + 4, payload, length);
  uint16_t crc = crc16CcittFalse(out + 2, static_cast<size_t>(2u) + length);
  out[4u + length] = static_cast<uint8_t>(crc & 0xFFu);
  out[5u + length] = static_cast<uint8_t>((crc >> 8) & 0xFFu);
  return static_cast<uint8_t>(total);
}

} // namespace guante

#endif
