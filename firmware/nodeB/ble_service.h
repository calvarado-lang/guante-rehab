#ifndef GUANTE_BLE_SERVICE_H
#define GUANTE_BLE_SERVICE_H

#include <Arduino.h>
#include <NimBLEDevice.h>
#include <NimBLEServer.h>
#include <NimBLEUtils.h>
#include <stddef.h>
#include <string.h>
#include <string>

#include "guante_config.h"
#include "guante_protocol.h"

enum BleEventType : uint8_t {
  BLE_EVENT_COMMAND = 0u,
  BLE_EVENT_CONNECTED = 1u,
  BLE_EVENT_DISCONNECTED = 2u
};

struct BleEvent {
  BleEventType type;
  uint8_t length;
  uint8_t data[20];
};

class BleEventQueue {
 public:
  BleEventQueue() : head_(0u), tail_(0u) {}

  bool push(BleEventType type, const uint8_t *data, uint8_t length) {
    if (length > sizeof(BleEvent::data)) return false;
    uint8_t next = static_cast<uint8_t>((head_ + 1u) % kCapacity);
    if (next == tail_) return false;
    BleEvent &event = events_[head_];
    event.type = type;
    event.length = length;
    if (length > 0u && data != nullptr) memcpy(event.data, data, length);
    head_ = next;
    return true;
  }

  bool pop(BleEvent &event) {
    if (tail_ == head_) return false;
    event = events_[tail_];
    tail_ = static_cast<uint8_t>((tail_ + 1u) % kCapacity);
    return true;
  }

 private:
  static const uint8_t kCapacity = 16u;
  volatile uint8_t head_;
  volatile uint8_t tail_;
  BleEvent events_[kCapacity];
};

class BleCommandCallbacks : public NimBLECharacteristicCallbacks {
 public:
  explicit BleCommandCallbacks(BleEventQueue *queue) : queue_(queue) {}

  void onWrite(NimBLECharacteristic *characteristic, NimBLEConnInfo & /*connInfo*/) override {
    // BLE callback rule: enqueue only. No motor I/O, logging, blocking or LEDC here.
    if (queue_ == nullptr || characteristic == nullptr) return;
    std::string value = characteristic->getValue();
    if (value.size() > 20u) return;
    queue_->push(BLE_EVENT_COMMAND,
                 reinterpret_cast<const uint8_t *>(value.data()),
                 static_cast<uint8_t>(value.size()));
  }

 private:
  BleEventQueue *queue_;
};

class BleServerCallbacks : public NimBLEServerCallbacks {
 public:
  explicit BleServerCallbacks(BleEventQueue *queue) : queue_(queue) {}

  void onConnect(NimBLEServer * /*server*/, NimBLEConnInfo & /*connInfo*/) override {
    if (queue_ != nullptr) queue_->push(BLE_EVENT_CONNECTED, nullptr, 0u);
  }

  void onDisconnect(NimBLEServer * /*server*/, NimBLEConnInfo & /*connInfo*/,
                    int /*reason*/) override {
    if (queue_ != nullptr) queue_->push(BLE_EVENT_DISCONNECTED, nullptr, 0u);
  }

 private:
  BleEventQueue *queue_;
};

class BleService {
 public:
  BleService()
      : server_(nullptr), service_(nullptr), sensors_(nullptr), motors_(nullptr),
        status_(nullptr), command_(nullptr), config_(nullptr), started_(false) {}

  bool begin(BleEventQueue *queue, uint32_t passkey) {
    if (queue == nullptr) return false;
    NimBLEDevice::init("Guante Rehab");
    NimBLEDevice::setSecurityAuth(true, true, true);
    NimBLEDevice::setSecurityPasskey(passkey);
    server_ = NimBLEDevice::createServer();
    if (server_ == nullptr) return false;
    server_->setCallbacks(new BleServerCallbacks(queue));
    service_ = server_->createService("6e400001-b5a3-f393-e0a9-e50e24dcca9e");
    if (service_ == nullptr) return false;
    sensors_ = service_->createCharacteristic(
        "6e400002-b5a3-f393-e0a9-e50e24dcca9e", NIMBLE_PROPERTY::NOTIFY);
    motors_ = service_->createCharacteristic(
        "6e400003-b5a3-f393-e0a9-e50e24dcca9e", NIMBLE_PROPERTY::NOTIFY);
    status_ = service_->createCharacteristic(
        "6e400004-b5a3-f393-e0a9-e50e24dcca9e",
        NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
    command_ = service_->createCharacteristic(
        "6e400005-b5a3-f393-e0a9-e50e24dcca9e", NIMBLE_PROPERTY::WRITE_NR);
    config_ = service_->createCharacteristic(
        "6e400006-b5a3-f393-e0a9-e50e24dcca9e",
        NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::WRITE);
    if (sensors_ == nullptr || motors_ == nullptr || status_ == nullptr ||
        command_ == nullptr || config_ == nullptr) return false;
    command_->setCallbacks(new BleCommandCallbacks(queue));
    uint8_t initialStatus[guante::BLE_STATUS_PACKET_LEN] = {0u, 0u, 0u, 0u};
    setValue(status_, initialStatus, sizeof(initialStatus));
    service_->start();
    NimBLEAdvertising *advertising = NimBLEDevice::getAdvertising();
    if (advertising == nullptr) return false;
    advertising->addServiceUUID("6e400001-b5a3-f393-e0a9-e50e24dcca9e");
    advertising->start();
    started_ = true;
    return true;
  }

  bool started() const { return started_; }

  void publishStatus(guante::DeviceState state, guante::ErrorCode error, uint16_t flags) {
    uint8_t packet[guante::BLE_STATUS_PACKET_LEN];
    guante::packStatus(packet, state, error, flags);
    if (status_ != nullptr) {
      setValue(status_, packet, sizeof(packet));
      status_->notify();
    }
  }

  void notifySensors(const uint8_t *packet, size_t length) {
    if (sensors_ == nullptr || packet == nullptr || length != guante::BLE_SENSOR_PACKET_LEN) return;
    setValue(sensors_, packet, length);
    sensors_->notify();
  }

  void notifyMotors(const uint8_t *packet, size_t length) {
    if (motors_ == nullptr || packet == nullptr || length != guante::BLE_MOTOR_PACKET_LEN) return;
    setValue(motors_, packet, length);
    motors_->notify();
  }

 private:
  static void setValue(NimBLECharacteristic *characteristic, const uint8_t *data, size_t length) {
    characteristic->setValue(data, length);
  }

  NimBLEServer *server_;
  NimBLEService *service_;
  NimBLECharacteristic *sensors_;
  NimBLECharacteristic *motors_;
  NimBLECharacteristic *status_;
  NimBLECharacteristic *command_;
  NimBLECharacteristic *config_;
  bool started_;
};

#endif
