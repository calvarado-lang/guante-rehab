#ifndef GUANTE_MOCK_NIMBLE_DEVICE_H
#define GUANTE_MOCK_NIMBLE_DEVICE_H

#include <stddef.h>
#include <stdint.h>
#include <string>

namespace NIMBLE_PROPERTY {
static const uint32_t READ = 0x01u;
static const uint32_t WRITE = 0x02u;
static const uint32_t WRITE_NR = 0x04u;
static const uint32_t NOTIFY = 0x08u;
static const uint32_t READ_ENC = 0x10u;
static const uint32_t WRITE_ENC = 0x20u;
}

class NimBLEConnInfo {};
class NimBLEServer;
class NimBLECharacteristic;

class NimBLECharacteristicCallbacks {
 public:
  virtual ~NimBLECharacteristicCallbacks() {}
  virtual void onWrite(NimBLECharacteristic *, NimBLEConnInfo &) {}
};

class NimBLEServerCallbacks {
 public:
  virtual ~NimBLEServerCallbacks() {}
  virtual void onConnect(NimBLEServer *, NimBLEConnInfo &) {}
  virtual void onDisconnect(NimBLEServer *, NimBLEConnInfo &, int) {}
};

class NimBLECharacteristic {
 public:
  void setCallbacks(NimBLECharacteristicCallbacks *) {}
  std::string getValue() const { return std::string(); }
  void setValue(const std::string &) {}
  void setValue(const uint8_t *, size_t) {}
  void notify() {}
};

class NimBLEService {
 public:
  NimBLECharacteristic *createCharacteristic(const char *, uint32_t) {
    static NimBLECharacteristic characteristic;
    return &characteristic;
  }
  const char *getUUID() const { return "mock"; }
  void start() {}
};

class NimBLEAdvertising {
 public:
  void addServiceUUID(const char *) {}
  void start() {}
};

class NimBLEServer {
 public:
  void setCallbacks(NimBLEServerCallbacks *) {}
  NimBLEService *createService(const char *) {
    static NimBLEService service;
    return &service;
  }
};

class NimBLEDevice {
 public:
  static void init(const char *) {}
  static void setSecurityAuth(bool, bool, bool) {}
  static void setSecurityPasskey(uint32_t) {}
  static NimBLEServer *createServer() {
    static NimBLEServer server;
    return &server;
  }
  static NimBLEAdvertising *getAdvertising() {
    static NimBLEAdvertising advertising;
    return &advertising;
  }
};

#endif
