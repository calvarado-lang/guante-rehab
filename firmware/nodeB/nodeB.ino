#include <Arduino.h>

#include "ble_service.h"
#include "guante_config.h"
#include "guante_logic.h"
#include "guante_protocol.h"
#include "motor_driver.h"
#include "pins.h"
#include "wifi_service.h"

HardwareSerial &nodeA = Serial1;
HardwareSerial &nodeC = Serial2;
MotorDriver motors;
BleEventQueue bleEvents;
BleService ble;
WifiEventQueue wifiEvents;
WifiService wifi;
guante::FrameParser parserA;
guante::FrameParser parserC;
guante::Supervisor supervisor;
guante::ClutchPolicy clutch;
guante::Health health = {false, false, false, false, false, false, false};

uint8_t sensorPacket[guante::BLE_SENSOR_PACKET_LEN] = {0};
uint8_t motorPacket[guante::BLE_MOTOR_PACKET_LEN] = {0};
uint16_t sensorFlags = 0u;
uint16_t batteryMv = 0u;
uint8_t sensorQuality = 0u;
guante::ErrorCode sensorError = guante::ERR_NONE;
int32_t encoderCounts[guante::FINGER_COUNT] = {0, 0, 0, 0, 0};

bool bleConnected = false;
bool wifiConnected = false;
bool seenA = false;
bool seenC = false;
bool startupFault = false;
uint32_t bootMs = 0u;
uint32_t lastAms = 0u;
uint32_t lastCms = 0u;
uint32_t benchStartedMs = 0u;
guante::BenchPlan activeBench = {0u, 0u, 0u};
bool benchActive = false;
bool benchPowerApplied = false;
uint8_t consoleLength = 0u;
char consoleLine[96] = {0};

static guante::ErrorCode lastPublishedError = guante::ERR_STARTUP;
static guante::DeviceState lastPublishedState = guante::STATE_SAFE_STOP;
static uint16_t lastPublishedFlags = 0xFFFFu;

static uint16_t currentStatusFlags() {
  uint16_t flags = supervisor.flags(health);
  if (batteryMv > 0u && batteryMv < 7000u) flags |= guante::FLAG_LOW_BATTERY; // PROVISIONAL.
  return flags;
}

static void publishCurrentStatus() {
  const uint16_t flags = currentStatusFlags();
  lastPublishedState = supervisor.state();
  lastPublishedError = supervisor.error();
  lastPublishedFlags = flags;
  ble.publishStatus(lastPublishedState, lastPublishedError, lastPublishedFlags);
  wifi.publishStatus(lastPublishedState, lastPublishedError, lastPublishedFlags);
}

static void writeUartFrame(HardwareSerial &serial, uint8_t type,
                           const uint8_t *payload, uint8_t length) {
  uint8_t wire[70];
  uint8_t wireLength = guante::buildFrame(wire, sizeof(wire), type, payload, length);
  if (wireLength > 0u) serial.write(wire, wireLength);
}

static void sendClutchCommand(uint8_t action) {
  writeUartFrame(nodeA, guante::FRAME_CLUTCH, &action, 1u);
}

static void sendCommandToA(uint8_t opcode) {
  writeUartFrame(nodeA, guante::FRAME_COMMAND, &opcode, 1u);
}

static bool physicalEstopPressed() {
  return digitalRead(PHYSICAL_ESTOP_PIN) == LOW;
}

static void publishStatusIfChanged() {
  const uint16_t flags = currentStatusFlags();
  if (supervisor.state() == lastPublishedState && supervisor.error() == lastPublishedError &&
      flags == lastPublishedFlags) return;
  publishCurrentStatus();
}

static void stopOutputAndReleaseClutch() {
  // Auditable stop chain: STBY LOW and PWM zero happen before clutch release.
  motors.stopAll();
  sendClutchCommand(0u);
  clutch.requestLoose();
  benchActive = false;
  benchPowerApplied = false;
  supervisor.setMotorsEnabled(false);
}

static void safetyStop(guante::ErrorCode error) {
  stopOutputAndReleaseClutch();
  supervisor.fault(error);
}

static void normalStop() {
  stopOutputAndReleaseClutch();
  supervisor.stop();
}

static void handleAFrame(const guante::UartFrame &frame) {
  if (frame.type != guante::FRAME_SENSORS || frame.length < 24u) return;
  memcpy(sensorPacket, frame.payload, sizeof(sensorPacket));
  sensorQuality = frame.payload[18];
  sensorError = static_cast<guante::ErrorCode>(frame.payload[19]);
  sensorFlags = guante::readLe16(frame.payload + 20);
  batteryMv = guante::readLe16(frame.payload + 22);
  seenA = true;
  lastAms = millis();
  if (sensorError == guante::ERR_CALIBRATION_CORRUPT ||
      sensorError == guante::ERR_FLEX_INVALID) {
    safetyStop(sensorError);
  }
  ble.notifySensors(sensorPacket, sizeof(sensorPacket));
  wifi.publishTelemetry(sensorPacket, sizeof(sensorPacket), encoderCounts,
                        guante::FINGER_COUNT, supervisor.state());
}

static void handleCFrame(const guante::UartFrame &frame) {
  if (frame.type != guante::FRAME_ENCODERS || frame.length != guante::BLE_MOTOR_PACKET_LEN) return;
  memcpy(motorPacket, frame.payload, sizeof(motorPacket));
  for (uint8_t i = 0u; i < guante::FINGER_COUNT; ++i)
    encoderCounts[i] = guante::readLe32Signed(frame.payload + i * 4u);
  seenC = true;
  lastCms = millis();
  ble.notifyMotors(motorPacket, sizeof(motorPacket));
}

static void processUart() {
  guante::UartFrame frame;
  while (nodeA.available() > 0) {
    if (parserA.feed(static_cast<uint8_t>(nodeA.read()), frame)) handleAFrame(frame);
  }
  while (nodeC.available() > 0) {
    if (parserC.feed(static_cast<uint8_t>(nodeC.read()), frame)) handleCFrame(frame);
  }
}

static bool handleCommand(const uint8_t *data, uint8_t length) {
  // Commands are dispatched from controlTick, never directly from onWrite.
  if (data == nullptr || length == 0u) {
    safetyStop(guante::ERR_INVALID_COMMAND);
    return false;
  }
  const uint8_t opcode = data[0];
  switch (opcode) {
    case guante::OP_SET_MODE:
      if (length != 2u || data[1] > 4u) {
        safetyStop(guante::ERR_INVALID_COMMAND); return false;
      } else {
        supervisor.setMode(data[1]); return true;
      }
      break;
    case guante::OP_SET_ASSIST_LEVEL:
      if (length != 2u || data[1] > 100u) {
        safetyStop(guante::ERR_INVALID_COMMAND); return false;
      } else {
        supervisor.setAssist(data[1]); return true;
      }
      break;
    case guante::OP_START:
      // Phase 1 explicitly has no BLE therapy/control output.
      if (length != 1u) { safetyStop(guante::ERR_INVALID_COMMAND); return false; }
      else if (!health.calibrated) { supervisor.fault(guante::ERR_NOT_CALIBRATED); return false; }
      else supervisor.fault(guante::ERR_INVALID_COMMAND);
      stopOutputAndReleaseClutch();
      return false;
    case guante::OP_STOP:
      if (length != 1u) { safetyStop(guante::ERR_INVALID_COMMAND); return false; }
      normalStop(); return true;
    case guante::OP_ESTOP:
      if (length != 1u) { safetyStop(guante::ERR_INVALID_COMMAND); return false; }
      safetyStop(guante::ERR_MECHANICAL_LIMIT); return true;
    case guante::OP_HEARTBEAT:
      if (length != 2u) { safetyStop(guante::ERR_INVALID_COMMAND); return false; }
      supervisor.heartbeat(millis()); return true;
    case guante::OP_CAL_EMG_BASELINE:
    case guante::OP_CAL_EMG_MVC:
    case guante::OP_CAL_FLEX_OPEN:
    case guante::OP_CAL_FLEX_CLOSED:
      if (length != 1u || supervisor.state() == guante::STATE_SAFE_STOP) {
        safetyStop(guante::ERR_INVALID_COMMAND); return false;
      } else {
        stopOutputAndReleaseClutch();
        supervisor.enterCalibration();
        sendCommandToA(opcode); return true;
      }
      break;
    default:
      safetyStop(guante::ERR_INVALID_COMMAND); return false;
  }
}

static void handleBleCmd(const uint8_t *data, uint8_t length) {
  handleCommand(data, length);
}

static void beginRemoteSession() {
  if (!bleConnected && !wifiConnected) supervisor.beginSession(millis());
}

static void endRemoteSessionIfNeeded() {
  if (bleConnected || wifiConnected) return;
  stopOutputAndReleaseClutch();
  supervisor.endSession();
  supervisor.fault(guante::ERR_HEARTBEAT_LOST);
}

static void processBleEvents() {
  BleEvent event;
  while (bleEvents.pop(event)) {
    if (event.type == BLE_EVENT_CONNECTED) {
      bleConnected = true;
      beginRemoteSession();
      publishCurrentStatus();
    } else if (event.type == BLE_EVENT_DISCONNECTED) {
      bleConnected = false;
      endRemoteSessionIfNeeded();
      publishStatusIfChanged();
    } else if (event.type == BLE_EVENT_COMMAND) {
      handleBleCmd(event.data, event.length);
    }
  }
}

static void processWifiEvents() {
  WifiEvent event;
  while (wifiEvents.pop(event)) {
    if (event.type == WIFI_EVENT_CONNECTED) {
      wifiConnected = true;
      beginRemoteSession();
      publishCurrentStatus();
    } else if (event.type == WIFI_EVENT_DISCONNECTED) {
      wifiConnected = false;
      endRemoteSessionIfNeeded();
      publishStatusIfChanged();
    } else if (event.type == WIFI_EVENT_COMMAND) {
      const bool accepted = handleCommand(event.data, event.length);
      wifi.sendAck(event.requestId, accepted, supervisor.state(), supervisor.error());
      publishStatusIfChanged();
    }
  }
}

static void updateHealthAndSafety(uint32_t now) {
  health.sensorsValid = seenA && sensorQuality != 0u && now - lastAms <= guante::NODE_A_TIMEOUT_MS;
  health.encoderValid = seenC && now - lastCms <= guante::NODE_C_TIMEOUT_MS;
  health.batteryValid = batteryMv >= static_cast<uint16_t>(guante::VBAT_CRITICAL_MIN_V * 1000.0f) &&
                        batteryMv <= static_cast<uint16_t>(guante::VBAT_VALID_MAX_V * 1000.0f);
  health.driverReady = motors.initialized() && !startupFault;
  health.calibrated = (sensorFlags & guante::FLAG_CALIBRATED) != 0u;
  health.emgValid = (sensorFlags & guante::FLAG_EMG_OK) != 0u;
  health.estopPressed = physicalEstopPressed();

  const bool grace = now - bootMs < 1000u;
  if (!grace || (seenA && seenC)) {
    if (!supervisor.observe(now, health)) stopOutputAndReleaseClutch();
  }
  if (supervisor.state() == guante::STATE_CALIBRATING && health.calibrated)
    supervisor.finishCalibration(health);
}

static void runBench(uint32_t now) {
  if (!benchActive) return;
  guante::BenchSafety safety = {health.driverReady, health.sensorsValid, health.encoderValid,
                                health.batteryValid, health.estopPressed,
                                supervisor.state() == guante::STATE_SAFE_STOP};
  if (!guante::benchSafetyAllows(safety)) {
    safetyStop(health.estopPressed ? guante::ERR_MECHANICAL_LIMIT : guante::ERR_DRIVER);
    return;
  }
  if (!health.calibrated) {
    safetyStop(guante::ERR_NOT_CALIBRATED);
    return;
  }
  clutch.tick(now);
  if (!benchPowerApplied) {
    if (!clutch.settled(now)) return;
    // Coupling has settled; only now may STBY go HIGH.
    motors.setStandby(true);
    benchPowerApplied = true;
    benchStartedMs = now;
    supervisor.setMotorsEnabled(true);
  }
  if (now - benchStartedMs >= activeBench.durationMs) {
    normalStop();
    return;
  }
  const int16_t duty = static_cast<int16_t>(activeBench.dutyPercent);
  for (uint8_t i = 0u; i < guante::FINGER_COUNT; ++i)
    if (activeBench.motorMask & (1u << i)) motors.writeDuty(i, duty);
}

static void startBench(const guante::BenchPlan &plan) {
  guante::BenchSafety safety = {health.driverReady, health.sensorsValid, health.encoderValid,
                                health.batteryValid, health.estopPressed,
                                supervisor.state() == guante::STATE_SAFE_STOP};
  if (!health.calibrated || !guante::benchSafetyAllows(safety)) return;
  stopOutputAndReleaseClutch();
  activeBench = plan;
  benchStartedMs = millis();
  benchActive = true;
  benchPowerApplied = false;
  clutch.requestCoupled(benchStartedMs);
  sendClutchCommand(1u);
}

static void processConsoleLine() {
  consoleLine[consoleLength] = '\0';
  if (consoleLine[0] == 'c' || consoleLine[0] == 'C') {
    if (!physicalEstopPressed()) supervisor.clearFault(health);
  } else {
    guante::BenchPlan plan;
    if (guante::parseBenchCommand(consoleLine, plan)) startBench(plan);
  }
  consoleLength = 0u;
}

static void processConsole() {
  while (Serial.available() > 0) {
    const char c = static_cast<char>(Serial.read());
    if (c == '\n' || c == '\r') {
      if (consoleLength > 0u) processConsoleLine();
    } else if (consoleLength + 1u < sizeof(consoleLine)) {
      consoleLine[consoleLength++] = c;
    } else {
      consoleLength = 0u;
    }
  }
}

static void controlTick() {
  const uint32_t now = millis();
  processConsole();
  processUart();
  wifi.process();
  processBleEvents();
  processWifiEvents();
  updateHealthAndSafety(now);
  if (physicalEstopPressed()) safetyStop(guante::ERR_MECHANICAL_LIMIT);
  runBench(now);
  publishStatusIfChanged();

  static uint32_t lastWifiLogMs = 0u;
  if (now - lastWifiLogMs >= 5000u) {
    lastWifiLogMs = now;
    Serial.print("[WiFi] IP=");
    Serial.println(wifi.ipAddress());
  }

#if GUANTE_SERIAL_DEBUG
  static uint32_t lastDebugMs = 0u;
  if (now - lastDebugMs >= guante::SERIAL_DEBUG_PERIOD_MS) {
    lastDebugMs = now;
    Serial.print("[B] A=");
    Serial.print(health.sensorsValid ? 1 : 0);
    Serial.print(" flex=");
    for (uint8_t i = 0u; i < guante::FINGER_COUNT; ++i) {
      if (i > 0u) Serial.print(',');
      Serial.print(guante::readLe16(sensorPacket + 2u + i * 2u));
    }
    Serial.print(" C=");
    Serial.print(health.encoderValid ? 1 : 0);
    Serial.print(" enc=");
    for (uint8_t i = 0u; i < guante::FINGER_COUNT; ++i) {
      if (i > 0u) Serial.print(',');
      Serial.print(encoderCounts[i]);
    }
    Serial.print(" state=");
    Serial.print(static_cast<uint8_t>(supervisor.state()));
    Serial.print(" err=");
    Serial.println(static_cast<uint8_t>(supervisor.error()));
  }
#endif
}

void setup() {
  bootMs = millis();
  Serial.begin(115200);
  pinMode(PHYSICAL_ESTOP_PIN, INPUT_PULLUP);
  nodeA.begin(guante::UART_BAUD, SERIAL_8N1, NODE_B_UART_A_RX, NODE_B_UART_A_TX);
  nodeC.begin(guante::UART_BAUD, SERIAL_8N1, NODE_B_UART_C_RX, NODE_B_UART_C_TX);
  clutch.boot();
  sendClutchCommand(0u);
  motors.stopAll();
  if (!motors.begin()) {
    startupFault = true;
    supervisor.fault(guante::ERR_DRIVER);
  }
  motors.stopAll();
  const bool bleStarted = ble.begin(&bleEvents, GUANTE_BLE_PASSKEY);
  const bool wifiStarted = wifi.begin(&wifiEvents, GUANTE_WIFI_SSID,
                                      GUANTE_WIFI_PASSWORD, GUANTE_WIFI_AP_SSID,
                                      GUANTE_WIFI_AP_PASSWORD);
  if (!bleStarted && !wifiStarted) {
    startupFault = true;
    supervisor.fault(guante::ERR_STARTUP);
  }
  publishStatusIfChanged();
}

void loop() {
  static uint32_t lastControlMs = 0u;
  const uint32_t now = millis();
  if (now - lastControlMs >= 5u) {
    lastControlMs = now;
    controlTick();
  }
}
