#ifndef GUANTE_LOGIC_H
#define GUANTE_LOGIC_H

#include "guante_config.h"
#include "guante_protocol.h"
#include <stddef.h>
#include <stdint.h>
#include <string.h>

namespace guante {

inline float clamp01(float value) {
  if (value < 0.0f) return 0.0f;
  if (value > 1.0f) return 1.0f;
  return value;
}

inline float dutyMax(float vbat, bool valid, uint32_t ageMs) {
  const float effectiveVbat = (valid && ageMs <= VBAT_MAX_AGE_MS && vbat > 0.0f)
                                  ? vbat
                                  : VBAT_VALID_MAX_V;
  const float limit = 6.0f / effectiveVbat;
  return clamp01(limit);
}

inline float rampToward(float current, float target, float maxStep) {
  if (maxStep < 0.0f) maxStep = -maxStep;
  if (target > current + maxStep) return current + maxStep;
  if (target < current - maxStep) return current - maxStep;
  return target;
}

inline bool positionViolation(int32_t position, int32_t minimum, int32_t maximum) {
  return position < minimum || position > maximum;
}

class StallDetector {
 public:
  StallDetector() : lastEncoder_(0), lastUpdateMs_(0u), stillMs_(0u), active_(false), stalled_(false) {}

  void reset(int32_t encoder, uint32_t nowMs) {
    lastEncoder_ = encoder;
    lastUpdateMs_ = nowMs;
    stillMs_ = 0u;
    active_ = false;
    stalled_ = false;
  }

  bool update(int32_t encoder, float commandedAbs, uint32_t nowMs,
              uint32_t thresholdMs = 500u) {
    uint32_t deltaMs = nowMs - lastUpdateMs_; // unsigned subtraction is wrap-safe.
    lastUpdateMs_ = nowMs;
    if (encoder != lastEncoder_) {
      lastEncoder_ = encoder;
      stillMs_ = 0u;
    } else if (commandedAbs > 0.01f) {
      active_ = true;
      const uint32_t prior = stillMs_;
      stillMs_ = (UINT32_MAX - prior < deltaMs) ? UINT32_MAX : prior + deltaMs;
    } else {
      active_ = false;
      stillMs_ = 0u;
      stalled_ = false;
    }
    stalled_ = active_ && stillMs_ >= thresholdMs;
    return stalled_;
  }

  bool stalled() const { return stalled_; }
  uint32_t stillMs() const { return stillMs_; }

 private:
  int32_t lastEncoder_;
  uint32_t lastUpdateMs_;
  uint32_t stillMs_;
  bool active_;
  bool stalled_;
};

struct CalibrationBlob {
  uint16_t magic;
  uint16_t version;
  uint16_t flexOpen[FINGER_COUNT];
  uint16_t flexClosed[FINGER_COUNT];
  uint16_t emgBaseline;
  uint16_t emgMvc;
  uint16_t crc;
};

static_assert(sizeof(CalibrationBlob) == 30u, "CalibrationBlob layout changed");

inline uint16_t calibrationCrc(const CalibrationBlob &blob) {
  return crc16CcittFalse(reinterpret_cast<const uint8_t *>(&blob),
                         offsetof(CalibrationBlob, crc));
}

class Calibration {
 public:
  Calibration() { clear(); }

  void clear() {
    memset(flexOpen_, 0, sizeof(flexOpen_));
    memset(flexClosed_, 0, sizeof(flexClosed_));
    emgBaseline_ = emgMvc_ = 0u;
    hasFlexOpen_ = hasFlexClosed_ = hasEmgBaseline_ = hasEmgMvc_ = false;
  }

  bool setFlexOpen(const uint16_t values[FINGER_COUNT]) {
    if (!validAdcArray(values)) return false;
    memcpy(flexOpen_, values, sizeof(flexOpen_));
    hasFlexOpen_ = true;
    return true;
  }

  bool setFlexClosed(const uint16_t values[FINGER_COUNT]) {
    if (!validAdcArray(values)) return false;
    memcpy(flexClosed_, values, sizeof(flexClosed_));
    hasFlexClosed_ = true;
    return true;
  }

  bool setEmgBaseline(uint16_t value) {
    if (!validAdc(value)) return false;
    emgBaseline_ = value;
    hasEmgBaseline_ = true;
    return true;
  }

  bool setEmgMvc(uint16_t value) {
    if (!validAdc(value)) return false;
    emgMvc_ = value;
    hasEmgMvc_ = true;
    return true;
  }

  bool flexValid() const {
    if (!hasFlexOpen_ || !hasFlexClosed_) return false;
    for (uint8_t i = 0; i < FINGER_COUNT; ++i) {
      uint16_t delta = flexOpen_[i] > flexClosed_[i]
                           ? static_cast<uint16_t>(flexOpen_[i] - flexClosed_[i])
                           : static_cast<uint16_t>(flexClosed_[i] - flexOpen_[i]);
      if (delta < MIN_FLEX_SPAN) return false;
    }
    return true;
  }

  bool emgValid() const {
    return hasEmgBaseline_ && hasEmgMvc_ && emgMvc_ >= emgBaseline_ + MIN_EMG_SPAN;
  }

  bool complete() const { return flexValid() && emgValid(); }
  bool hasFlexOpen() const { return hasFlexOpen_; }
  bool hasFlexClosed() const { return hasFlexClosed_; }
  bool hasEmgBaseline() const { return hasEmgBaseline_; }
  bool hasEmgMvc() const { return hasEmgMvc_; }
  const uint16_t *flexOpen() const { return flexOpen_; }
  const uint16_t *flexClosed() const { return flexClosed_; }
  uint16_t emgBaseline() const { return emgBaseline_; }
  uint16_t emgMvc() const { return emgMvc_; }

  void exportBlob(CalibrationBlob &blob) const {
    memset(&blob, 0, sizeof(blob));
    blob.magic = CALIBRATION_MAGIC;
    blob.version = CALIBRATION_FORMAT_VERSION;
    memcpy(blob.flexOpen, flexOpen_, sizeof(flexOpen_));
    memcpy(blob.flexClosed, flexClosed_, sizeof(flexClosed_));
    blob.emgBaseline = emgBaseline_;
    blob.emgMvc = emgMvc_;
    blob.crc = calibrationCrc(blob);
  }

  bool importBlob(const CalibrationBlob &blob) {
    if (blob.magic != CALIBRATION_MAGIC || blob.version != CALIBRATION_FORMAT_VERSION ||
        calibrationCrc(blob) != blob.crc) {
      clear();
      return false;
    }
    clear();
    if (!setFlexOpen(blob.flexOpen) || !setFlexClosed(blob.flexClosed) ||
        !setEmgBaseline(blob.emgBaseline) || !setEmgMvc(blob.emgMvc) || !complete()) {
      clear();
      return false;
    }
    return true;
  }

 private:
  static bool validAdc(uint16_t value) {
    return value >= ADC_RAW_MIN_VALID && value <= ADC_RAW_MAX_VALID;
  }

  static bool validAdcArray(const uint16_t values[FINGER_COUNT]) {
    if (values == NULL) return false;
    for (uint8_t i = 0; i < FINGER_COUNT; ++i) if (!validAdc(values[i])) return false;
    return true;
  }

  uint16_t flexOpen_[FINGER_COUNT];
  uint16_t flexClosed_[FINGER_COUNT];
  uint16_t emgBaseline_;
  uint16_t emgMvc_;
  bool hasFlexOpen_;
  bool hasFlexClosed_;
  bool hasEmgBaseline_;
  bool hasEmgMvc_;
};

enum CalibrationLoadResult : uint8_t { CAL_LOAD_OK, CAL_LOAD_MISSING, CAL_LOAD_CORRUPT };

inline CalibrationLoadResult loadCalibrationBlob(const uint8_t *data, size_t length,
                                                  Calibration &calibration) {
  if (data == NULL || length == 0u) return CAL_LOAD_MISSING;
  if (length != sizeof(CalibrationBlob)) return CAL_LOAD_CORRUPT;
  CalibrationBlob blob;
  memcpy(&blob, data, sizeof(blob));
  if (!calibration.importBlob(blob)) return CAL_LOAD_CORRUPT;
  return CAL_LOAD_OK;
}

struct Health {
  bool sensorsValid;
  bool encoderValid;
  bool batteryValid;
  bool driverReady;
  bool calibrated;
  bool emgValid;
  bool estopPressed;
};

inline bool healthSafe(const Health &health) {
  return health.sensorsValid && health.encoderValid && health.batteryValid &&
         health.driverReady && health.calibrated && !health.estopPressed;
}

class Supervisor {
 public:
  Supervisor()
      : state_(STATE_IDLE), error_(ERR_NONE), mode_(0u), assist_(0u),
        motorsEnabled_(false), faultLatched_(false), heartbeatSeen_(false),
        lastHeartbeatMs_(0u) {}

  DeviceState state() const { return state_; }
  ErrorCode error() const { return error_; }
  uint8_t mode() const { return mode_; }
  uint8_t assist() const { return assist_; }
  bool motorsEnabled() const { return motorsEnabled_; }
  bool faultLatched() const { return faultLatched_; }

  uint16_t flags(const Health &health) const {
    uint16_t value = 0u;
    if (health.calibrated) value |= FLAG_CALIBRATED;
    if (health.emgValid) value |= FLAG_EMG_OK;
    if (motorsEnabled_) value |= FLAG_MOTORS_ENABLED;
    if (!health.batteryValid) value |= FLAG_LOW_BATTERY;
    return value;
  }

  void setMode(uint8_t mode) {
    if (mode <= 4u) mode_ = mode;
  }

  bool setAssist(uint8_t assist) {
    if (assist > 100u) return false;
    assist_ = assist;
    return true;
  }

  void beginSession(uint32_t nowMs) {
    heartbeatSeen_ = false;
    lastHeartbeatMs_ = nowMs;
  }

  void endSession() {
    heartbeatSeen_ = false;
    motorsEnabled_ = false;
  }

  void heartbeat(uint32_t nowMs) {
    heartbeatSeen_ = true;
    lastHeartbeatMs_ = nowMs;
  }

  bool heartbeatExpired(uint32_t nowMs) const {
    return heartbeatSeen_ && (nowMs - lastHeartbeatMs_ > HEARTBEAT_TIMEOUT_MS);
  }

  bool observe(uint32_t nowMs, const Health &health) {
    if (health.estopPressed) {
      fault(ERR_MECHANICAL_LIMIT);
      return false;
    }
    if (heartbeatExpired(nowMs)) {
      fault(ERR_HEARTBEAT_LOST);
      return false;
    }
    if (!health.driverReady) { fault(ERR_DRIVER); return false; }
    if (!health.sensorsValid) { fault(ERR_FLEX_INVALID); return false; }
    if (!health.encoderValid) { fault(ERR_ENCODER_UART_INVALID); return false; }
    if (!health.batteryValid) { fault(ERR_BATTERY_CRITICAL); return false; }
    if (state_ == STATE_CALIBRATING) return true;
    if (!health.calibrated && state_ != STATE_SAFE_STOP) {
      // Not calibrated is a start precondition, not a latched fault at boot.
      error_ = ERR_NOT_CALIBRATED;
    }
    return true;
  }

  bool requestStart(const Health &health) {
    if (state_ == STATE_SAFE_STOP || faultLatched_) return false;
    if (!healthSafe(health)) {
      error_ = health.estopPressed ? ERR_MECHANICAL_LIMIT : ERR_NOT_CALIBRATED;
      return false;
    }
    state_ = mode_ == 0u ? STATE_PASSIVE
                         : mode_ == 1u ? STATE_PASSIVE
                         : mode_ == 2u ? STATE_ASSISTED
                         : mode_ == 3u ? STATE_ASSISTED
                                       : STATE_ADAPTIVE;
    motorsEnabled_ = false; // Phase 1 deliberately has no BLE therapy output.
    return true;
  }

  void enterCalibration() {
    motorsEnabled_ = false;
    state_ = STATE_CALIBRATING;
  }

  void finishCalibration(const Health &health) {
    motorsEnabled_ = false;
    if (health.calibrated) {
      state_ = STATE_IDLE;
      error_ = ERR_NONE;
    }
  }

  bool stop() {
    motorsEnabled_ = false;
    if (state_ == STATE_SAFE_STOP) return false; // STOP never clears a latched fault.
    state_ = STATE_IDLE;
    return true;
  }

  bool clearFault(const Health &health) {
    if (state_ != STATE_SAFE_STOP || health.estopPressed || !healthSafe(health)) return false;
    faultLatched_ = false;
    error_ = ERR_NONE;
    state_ = STATE_IDLE;
    motorsEnabled_ = false;
    return true;
  }

  void setMotorsEnabled(bool enabled) {
    motorsEnabled_ = enabled && state_ != STATE_SAFE_STOP && !faultLatched_;
  }

  void fault(ErrorCode error) {
    motorsEnabled_ = false;
    state_ = STATE_SAFE_STOP;
    error_ = error;
    faultLatched_ = true;
  }

 private:
  DeviceState state_;
  ErrorCode error_;
  uint8_t mode_;
  uint8_t assist_;
  bool motorsEnabled_;
  bool faultLatched_;
  bool heartbeatSeen_;
  uint32_t lastHeartbeatMs_;
};

enum ClutchState : uint8_t { CLUTCH_LOOSE = 0, CLUTCH_COUPLING = 1, CLUTCH_COUPLED = 2 };

class ClutchPolicy {
 public:
  ClutchPolicy() : state_(CLUTCH_LOOSE), requestedAtMs_(0u) {}
  ClutchState state() const { return state_; }
  void boot() { state_ = CLUTCH_LOOSE; requestedAtMs_ = 0u; }
  void loose() { state_ = CLUTCH_LOOSE; requestedAtMs_ = 0u; }
  void requestCoupled(uint32_t nowMs) {
    if (state_ == CLUTCH_LOOSE) {
      state_ = CLUTCH_COUPLING;
      requestedAtMs_ = nowMs;
    }
  }
  void requestLoose() { loose(); }
  void tick(uint32_t nowMs) {
    if (state_ == CLUTCH_COUPLING && nowMs - requestedAtMs_ >= CLUTCH_SETTLE_MS)
      state_ = CLUTCH_COUPLED;
  }
  bool settled(uint32_t nowMs) const {
    return state_ == CLUTCH_COUPLED ||
           (state_ == CLUTCH_COUPLING && nowMs - requestedAtMs_ >= CLUTCH_SETTLE_MS);
  }

 private:
  ClutchState state_;
  uint32_t requestedAtMs_;
};

struct BenchPlan {
  uint8_t motorMask;
  uint8_t dutyPercent;
  uint16_t durationMs;
};

inline uint8_t bitCount(uint8_t value) {
  uint8_t count = 0u;
  while (value != 0u) { count += static_cast<uint8_t>(value & 1u); value >>= 1; }
  return count;
}

inline const char *skipSpaces(const char *p) {
  while (p != NULL && (*p == ' ' || *p == '\t')) ++p;
  return p;
}

inline bool readUnsigned(const char *&p, uint32_t &value) {
  p = skipSpaces(p);
  if (p == NULL || *p < '0' || *p > '9') return false;
  value = 0u;
  while (*p >= '0' && *p <= '9') {
    value = value * 10u + static_cast<uint32_t>(*p - '0');
    ++p;
  }
  return true;
}

inline bool parseBenchCommand(const char *line, BenchPlan &plan) {
  if (line == NULL) return false;
  const char *p = skipSpaces(line);
  char command = *p++;
  const bool isGroup = command == 'b' || command == 'B';
  const bool isLegacy = command == 'm' || command == 'M';
  if (!isGroup && !isLegacy) return false;
  uint8_t mask = 0u;
  uint8_t count = 0u;
  while (true) {
    uint32_t index;
    if (!readUnsigned(p, index) || index >= FINGER_COUNT) return false;
    uint8_t bit = static_cast<uint8_t>(1u << index);
    if (mask & bit) return false;
    mask |= bit;
    ++count;
    p = skipSpaces(p);
    if (*p == ',') { ++p; continue; }
    break;
  }
  uint32_t duty;
  uint32_t duration;
  if (!readUnsigned(p, duty) || !readUnsigned(p, duration)) return false;
  p = skipSpaces(p);
  if (*p != '\0' || duty > BENCH_MAX_DUTY_PERCENT || duration == 0u ||
      duration > BENCH_MAX_MS) return false;
  if (count < (isGroup ? 2u : 1u) || count > FINGER_COUNT) return false;
  plan.motorMask = mask;
  plan.dutyPercent = static_cast<uint8_t>(duty);
  plan.durationMs = static_cast<uint16_t>(duration);
  return true;
}

struct BenchSafety {
  bool driverReady;
  bool sensorsValid;
  bool encoderValid;
  bool batteryValid;
  bool estopPressed;
  bool safeStop;
};

inline bool benchSafetyAllows(const BenchSafety &safety) {
  return safety.driverReady && safety.sensorsValid && safety.encoderValid &&
         safety.batteryValid && !safety.estopPressed && !safety.safeStop;
}

} // namespace guante

#endif
