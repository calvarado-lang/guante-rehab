#ifndef GUANTE_WIFI_SERVICE_H
#define GUANTE_WIFI_SERVICE_H

#include <Arduino.h>
#include <WiFi.h>
#include <mbedtls/sha1.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "guante_config.h"
#include "guante_protocol.h"

enum WifiEventType : uint8_t {
  WIFI_EVENT_COMMAND = 0u,
  WIFI_EVENT_CONNECTED = 1u,
  WIFI_EVENT_DISCONNECTED = 2u
};

struct WifiEvent {
  WifiEventType type;
  uint8_t length;
  uint8_t data[4];
  char requestId[40];
};

class WifiEventQueue {
 public:
  WifiEventQueue() : head_(0u), tail_(0u) {}

  bool push(WifiEventType type, const uint8_t *data, uint8_t length,
            const char *requestId = nullptr) {
    if (length > sizeof(WifiEvent::data)) return false;
    uint8_t next = static_cast<uint8_t>((head_ + 1u) % kCapacity);
    if (next == tail_) return false;
    WifiEvent &event = events_[head_];
    event.type = type;
    event.length = length;
    memset(event.data, 0, sizeof(event.data));
    memset(event.requestId, 0, sizeof(event.requestId));
    if (length > 0u && data != nullptr) memcpy(event.data, data, length);
    if (requestId != nullptr) {
      strncpy(event.requestId, requestId, sizeof(event.requestId) - 1u);
    }
    head_ = next;
    return true;
  }

  bool pop(WifiEvent &event) {
    if (tail_ == head_) return false;
    event = events_[tail_];
    tail_ = static_cast<uint8_t>((tail_ + 1u) % kCapacity);
    return true;
  }

 private:
  static const uint8_t kCapacity = 16u;
  volatile uint8_t head_;
  volatile uint8_t tail_;
  WifiEvent events_[kCapacity];
};

class WifiService {
 public:
  WifiService()
      : server_(80), queue_(nullptr), hasClient_(false), websocket_(false),
        helloAccepted_(false), started_(false), requestLength_(0u) {
    request_[0] = '\0';
  }

  bool begin(WifiEventQueue *queue, const char *ssid, const char *password,
             const char *apSsid, const char *apPassword) {
    if (queue == nullptr) return false;
    queue_ = queue;
    if (ssid != nullptr && strlen(ssid) > 0u) {
      WiFi.mode(WIFI_STA);
      WiFi.begin(ssid, password == nullptr ? "" : password);
    } else {
      WiFi.mode(WIFI_AP);
      if (!WiFi.softAP(apSsid == nullptr ? "Guante-Rehab" : apSsid,
                       apPassword == nullptr ? "guante1234" : apPassword)) {
        return false;
      }
    }
    server_.begin();
    server_.setNoDelay(true);
    started_ = true;
    return true;
  }

  void process() {
    if (!started_) return;
    if (!hasClient_) {
      WiFiClient candidate = server_.available();
      if (candidate) {
        client_ = candidate;
        hasClient_ = true;
        websocket_ = false;
        helloAccepted_ = false;
        requestLength_ = 0u;
      }
    }
    if (!hasClient_) return;
    if (!client_.connected()) {
      closeClient(true);
      return;
    }
    if (websocket_) processWebSocket();
    else processHttp();
  }

  bool started() const { return started_; }

  void publishStatus(guante::DeviceState state, guante::ErrorCode error,
                     uint16_t flags) {
    if (!readyForMessages()) return;
    char message[192];
    snprintf(message, sizeof(message),
             "{\"type\":\"status\",\"version\":1,\"state\":%u,\"errorCode\":%u,\"flags\":%u,\"timestamp\":%lu}",
             static_cast<unsigned>(state), static_cast<unsigned>(error),
             static_cast<unsigned>(flags), static_cast<unsigned long>(millis()));
    sendText(message);
  }

  void publishTelemetry(const uint8_t *sensors, size_t sensorLength,
                        const int32_t *encoderCounts, size_t encoderLength,
                        guante::DeviceState state) {
    if (!readyForMessages() || sensors == nullptr || encoderCounts == nullptr ||
        sensorLength != guante::BLE_SENSOR_PACKET_LEN || encoderLength != guante::FINGER_COUNT) {
      return;
    }
    char message[640];
    snprintf(message, sizeof(message),
             "{\"type\":\"telemetry\",\"version\":1,\"seq\":%u,\"timestamp\":%lu,\"flex\":[%u,%u,%u,%u,%u],\"emgEnvelope\":%u,\"fsr\":%u,\"encoderCounts\":[%ld,%ld,%ld,%ld,%ld],\"state\":%u,\"batteryPct\":%u}",
             static_cast<unsigned>(guante::readLe16(sensors)),
             static_cast<unsigned long>(millis()),
             static_cast<unsigned>(guante::readLe16(sensors + 2u)),
             static_cast<unsigned>(guante::readLe16(sensors + 4u)),
             static_cast<unsigned>(guante::readLe16(sensors + 6u)),
             static_cast<unsigned>(guante::readLe16(sensors + 8u)),
             static_cast<unsigned>(guante::readLe16(sensors + 10u)),
             static_cast<unsigned>(guante::readLe16(sensors + 12u)),
             static_cast<unsigned>(guante::readLe16(sensors + 14u)),
             static_cast<long>(encoderCounts[0]), static_cast<long>(encoderCounts[1]),
             static_cast<long>(encoderCounts[2]), static_cast<long>(encoderCounts[3]),
             static_cast<long>(encoderCounts[4]), static_cast<unsigned>(state),
             static_cast<unsigned>(sensors[17]));
    sendText(message);
  }

  void sendAck(const char *requestId, bool accepted, guante::DeviceState state,
               guante::ErrorCode error) {
    if (!readyForMessages() || requestId == nullptr) return;
    char message[240];
    snprintf(message, sizeof(message),
             "{\"type\":\"ack\",\"requestId\":\"%s\",\"accepted\":%s,\"state\":%u,\"errorCode\":%u}",
             requestId, accepted ? "true" : "false", static_cast<unsigned>(state),
             static_cast<unsigned>(error));
    sendText(message);
  }

  const char *ipAddress() const {
    static char address[20];
    IPAddress ip = WiFi.getMode() == WIFI_AP ? WiFi.softAPIP() : WiFi.localIP();
    snprintf(address, sizeof(address), "%u.%u.%u.%u", ip[0], ip[1], ip[2], ip[3]);
    return address;
  }

 private:
  bool readyForMessages() const { return hasClient_ && websocket_ && helloAccepted_; }

  void closeClient(bool notify) {
    const bool wasReady = helloAccepted_;
    client_.stop();
    hasClient_ = false;
    websocket_ = false;
    helloAccepted_ = false;
    requestLength_ = 0u;
    if (notify && wasReady && queue_ != nullptr) queue_->push(WIFI_EVENT_DISCONNECTED, nullptr, 0u);
  }

  void processHttp() {
    while (client_.available() > 0 && requestLength_ + 1u < sizeof(request_)) {
      request_[requestLength_++] = static_cast<char>(client_.read());
      request_[requestLength_] = '\0';
      if (requestLength_ >= 4u &&
          strcmp(request_ + requestLength_ - 4u, "\r\n\r\n") == 0) {
        handleHttpRequest();
        return;
      }
    }
    if (requestLength_ + 1u >= sizeof(request_)) closeClient(false);
  }

  void handleHttpRequest() {
    if (strncmp(request_, "GET /ws/telemetry ", strlen("GET /ws/telemetry ")) == 0) {
      upgradeWebSocket();
      return;
    }
    if (strncmp(request_, "GET /device/health ", strlen("GET /device/health ")) == 0) {
      sendHttpJson("{\"ok\":true,\"protocol\":\"wifi-v1\",\"transport\":\"wifi\"}");
    } else if (strncmp(request_, "GET /device/info ", strlen("GET /device/info ")) == 0) {
      sendHttpJson("{\"deviceId\":\"guante-001\",\"protocol\":\"wifi-v1\",\"firmwareVersion\":\"0.1.0\",\"transport\":\"wifi\"}");
    } else {
      sendHttpJson("{\"error\":\"not_found\"}", 404);
    }
    closeClient(false);
  }

  void sendHttpJson(const char *body, int status = 200) {
    client_.printf("HTTP/1.1 %d %s\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\nContent-Length: %u\r\n\r\n%s",
                   status, status == 200 ? "OK" : "Not Found",
                   static_cast<unsigned>(strlen(body)), body);
  }

  void upgradeWebSocket() {
    const char *header = strstr(request_, "Sec-WebSocket-Key:");
    if (header == nullptr) {
      closeClient(false);
      return;
    }
    header += 18u;
    while (*header == ' ') ++header;
    char key[64];
    size_t keyLength = 0u;
    while (*header != '\0' && *header != '\r' && *header != '\n' &&
           keyLength + 1u < sizeof(key)) key[keyLength++] = *header++;
    key[keyLength] = '\0';
    char handshake[128];
    snprintf(handshake, sizeof(handshake), "%s258EAFA5-E914-47DA-95CA-C5AB0DC85B11", key);
    uint8_t digest[20];
    mbedtls_sha1_ret(reinterpret_cast<const unsigned char *>(handshake), strlen(handshake), digest);
    char accept[32];
    base64Encode(digest, sizeof(digest), accept, sizeof(accept));
    client_.printf("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: %s\r\n\r\n", accept);
    websocket_ = true;
    requestLength_ = 0u;
    request_[0] = '\0';
  }

  void processWebSocket() {
    if (client_.available() < 2) return;
    uint8_t header[2];
    if (!readBytes(header, sizeof(header))) {
      closeClient(true);
      return;
    }
    const uint8_t opcode = header[0] & 0x0Fu;
    const bool masked = (header[1] & 0x80u) != 0u;
    uint64_t length = header[1] & 0x7Fu;
    if (length == 126u) {
      uint8_t extended[2];
      if (!readBytes(extended, sizeof(extended))) { closeClient(true); return; }
      length = (static_cast<uint64_t>(extended[0]) << 8u) | extended[1];
    } else if (length == 127u) {
      closeClient(true);
      return;
    }
    if (!masked || length > 768u) {
      closeClient(true);
      return;
    }
    uint8_t mask[4];
    if (!readBytes(mask, sizeof(mask))) { closeClient(true); return; }
    uint8_t payload[769];
    if (!readBytes(payload, static_cast<size_t>(length))) { closeClient(true); return; }
    for (size_t i = 0u; i < static_cast<size_t>(length); ++i) payload[i] ^= mask[i % 4u];
    if (opcode == 0x8u) { closeClient(true); return; }
    if (opcode == 0x9u) { sendFrame(0xAu, payload, static_cast<size_t>(length)); return; }
    if (opcode == 0x1u) {
      payload[length] = '\0';
      handleText(reinterpret_cast<const char *>(payload));
    }
  }

  bool readBytes(uint8_t *output, size_t length) {
    const uint32_t started = millis();
    size_t received = 0u;
    while (received < length && millis() - started < 60u) {
      if (client_.available() > 0) received += client_.read(output + received, length - received);
      else delay(1);
    }
    return received == length;
  }

  void handleText(const char *json) {
    char type[20];
    if (!jsonString(json, "type", type, sizeof(type))) return;
    if (strcmp(type, "hello") == 0) {
      char protocol[20];
      if (!jsonString(json, "protocol", protocol, sizeof(protocol)) || strcmp(protocol, "wifi-v1") != 0) {
        sendError(nullptr, "protocol_mismatch");
        closeClient(false);
        return;
      }
      helloAccepted_ = true;
      sendText("{\"type\":\"hello_ack\",\"protocol\":\"wifi-v1\",\"deviceId\":\"guante-001\",\"firmwareVersion\":\"0.1.0\",\"capabilities\":[\"telemetry\",\"calibration\",\"heartbeat\"],\"state\":0}");
      if (queue_ != nullptr) queue_->push(WIFI_EVENT_CONNECTED, nullptr, 0u);
      return;
    }
    if (!helloAccepted_) { sendError(nullptr, "hello_required"); return; }
    if (strcmp(type, "command") != 0) return;
    char command[32];
    char requestId[40];
    if (!jsonString(json, "command", command, sizeof(command)) ||
        !jsonString(json, "requestId", requestId, sizeof(requestId))) {
      sendError(nullptr, "invalid_command");
      return;
    }
    uint8_t opcode = 0u;
    uint8_t length = 1u;
    uint8_t data[4] = {0u, 0u, 0u, 0u};
    if (strcmp(command, "SET_MODE") == 0) {
      long value;
      if (!jsonNumber(json, "mode", value) || value < 0 || value > 4) { sendError(requestId, "invalid_mode"); return; }
      opcode = guante::OP_SET_MODE; data[1] = static_cast<uint8_t>(value); length = 2u;
    } else if (strcmp(command, "SET_ASSIST_LEVEL") == 0) {
      long value;
      if (!jsonNumber(json, "level", value) || value < 0 || value > 100) { sendError(requestId, "invalid_level"); return; }
      opcode = guante::OP_SET_ASSIST_LEVEL; data[1] = static_cast<uint8_t>(value); length = 2u;
    } else {
      if (strcmp(command, "START") == 0) opcode = guante::OP_START;
      else if (strcmp(command, "STOP") == 0) opcode = guante::OP_STOP;
      else if (strcmp(command, "ESTOP") == 0) opcode = guante::OP_ESTOP;
      else if (strcmp(command, "CAL_EMG_BASELINE") == 0) opcode = guante::OP_CAL_EMG_BASELINE;
      else if (strcmp(command, "CAL_EMG_MVC") == 0) opcode = guante::OP_CAL_EMG_MVC;
      else if (strcmp(command, "CAL_FLEX_OPEN") == 0) opcode = guante::OP_CAL_FLEX_OPEN;
      else if (strcmp(command, "CAL_FLEX_CLOSED") == 0) opcode = guante::OP_CAL_FLEX_CLOSED;
      else if (strcmp(command, "HEARTBEAT") == 0) {
        long value;
        if (!jsonNumber(json, "counter", value) || value < 0 || value > 255) { sendError(requestId, "invalid_counter"); return; }
        opcode = guante::OP_HEARTBEAT; data[1] = static_cast<uint8_t>(value); length = 2u;
      } else { sendError(requestId, "unknown_command"); return; }
    }
    data[0] = opcode;
    if (queue_ != nullptr) queue_->push(WIFI_EVENT_COMMAND, data, length, requestId);
  }

  void sendError(const char *requestId, const char *error) {
    if (!hasClient_ || !websocket_) return;
    char message[180];
    if (requestId == nullptr) snprintf(message, sizeof(message), "{\"type\":\"error\",\"message\":\"%s\"}", error);
    else snprintf(message, sizeof(message), "{\"type\":\"error\",\"requestId\":\"%s\",\"message\":\"%s\"}", requestId, error);
    sendText(message);
  }

  void sendText(const char *message) { sendFrame(0x1u, reinterpret_cast<const uint8_t *>(message), strlen(message)); }

  void sendFrame(uint8_t opcode, const uint8_t *payload, size_t length) {
    if (!hasClient_ || !websocket_ || length > 65535u) return;
    uint8_t header[4];
    size_t headerLength = 2u;
    header[0] = static_cast<uint8_t>(0x80u | opcode);
    if (length < 126u) header[1] = static_cast<uint8_t>(length);
    else { header[1] = 126u; header[2] = static_cast<uint8_t>((length >> 8u) & 0xFFu); header[3] = static_cast<uint8_t>(length & 0xFFu); headerLength = 4u; }
    client_.write(header, headerLength);
    client_.write(payload, length);
  }

  static bool jsonString(const char *json, const char *key, char *output, size_t capacity) {
    char needle[48];
    snprintf(needle, sizeof(needle), "\"%s\"", key);
    const char *position = strstr(json, needle);
    if (position == nullptr) return false;
    position = strchr(position + strlen(needle), ':');
    if (position == nullptr) return false;
    ++position;
    while (*position == ' ' || *position == '\t') ++position;
    if (*position != '"') return false;
    ++position;
    size_t index = 0u;
    while (*position != '\0' && *position != '"' && index + 1u < capacity) output[index++] = *position++;
    output[index] = '\0';
    return *position == '"';
  }

  static bool jsonNumber(const char *json, const char *key, long &output) {
    char needle[48];
    snprintf(needle, sizeof(needle), "\"%s\"", key);
    const char *position = strstr(json, needle);
    if (position == nullptr) return false;
    position = strchr(position + strlen(needle), ':');
    if (position == nullptr) return false;
    char *end = nullptr;
    output = strtol(position + 1, &end, 10);
    return end != position + 1;
  }

  static void base64Encode(const uint8_t *data, size_t length, char *output, size_t capacity) {
    static const char alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    size_t out = 0u;
    for (size_t index = 0u; index < length && out + 4u < capacity; index += 3u) {
      const uint32_t value = static_cast<uint32_t>(data[index]) << 16u |
                             static_cast<uint32_t>(index + 1u < length ? data[index + 1u] : 0u) << 8u |
                             static_cast<uint32_t>(index + 2u < length ? data[index + 2u] : 0u);
      output[out++] = alphabet[(value >> 18u) & 0x3Fu];
      output[out++] = alphabet[(value >> 12u) & 0x3Fu];
      output[out++] = index + 1u < length ? alphabet[(value >> 6u) & 0x3Fu] : '=';
      output[out++] = index + 2u < length ? alphabet[value & 0x3Fu] : '=';
    }
    output[out] = '\0';
  }

  WiFiServer server_;
  WiFiClient client_;
  WifiEventQueue *queue_;
  bool hasClient_;
  bool websocket_;
  bool helloAccepted_;
  bool started_;
  size_t requestLength_;
  char request_[1024];
};

#endif
