#include "../common/guante_logic.h"
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

using namespace guante;

static unsigned tests = 0;

#define CHECK(expr) do { ++tests; assert((expr)); } while (0)

static void test_protocol() {
  uint8_t sensors[BLE_SENSOR_PACKET_LEN];
  uint16_t flex[FINGER_COUNT] = {100, 200, 300, 400, 500};
  CHECK(packSensors(sensors, 0xBEEFu, flex, 1234u, 2345u, STATE_IDLE, 88u) == 18u);
  CHECK(readLe16(sensors) == 0xBEEFu);
  CHECK(readLe16(sensors + 10) == 500u);
  CHECK(readLe16(sensors + 12) == 1234u);
  CHECK(sensors[16] == STATE_IDLE && sensors[17] == 88u);

  int32_t counts[FINGER_COUNT] = {0, -1, 2, INT32_MAX, INT32_MIN};
  uint8_t motors[BLE_MOTOR_PACKET_LEN];
  CHECK(packMotors(motors, counts) == 20u);
  for (uint8_t i = 0; i < FINGER_COUNT; ++i) CHECK(readLe32Signed(motors + i * 4u) == counts[i]);

  uint8_t status[BLE_STATUS_PACKET_LEN];
  CHECK(packStatus(status, STATE_SAFE_STOP, ERR_HEARTBEAT_LOST, FLAG_CALIBRATED) == 4u);
  CHECK(status[0] == STATE_SAFE_STOP && status[1] == ERR_HEARTBEAT_LOST);
  CHECK(readLe16(status + 2) == FLAG_CALIBRATED);

  uint8_t payload[] = {0x01u, 0x02u, 0x03u, 0x04u};
  uint8_t wire[80];
  uint8_t wireLen = buildFrame(wire, sizeof(wire), FRAME_COMMAND, payload, sizeof(payload));
  CHECK(wireLen == 10u);
  UartFrame frame;
  FrameParser parser;
  bool delivered = false;
  for (uint8_t i = 0; i < wireLen; ++i) delivered = parser.feed(wire[i], frame) || delivered;
  CHECK(delivered && frame.type == FRAME_COMMAND && frame.length == 4u);
  CHECK(memcmp(frame.payload, payload, sizeof(payload)) == 0);
  wire[wireLen - 1u] ^= 0x55u;
  parser.reset();
  delivered = false;
  for (uint8_t i = 0; i < wireLen; ++i) delivered = parser.feed(wire[i], frame) || delivered;
  CHECK(!delivered);
}

static void test_calibration() {
  uint16_t open[FINGER_COUNT] = {100, 110, 120, 130, 140};
  uint16_t closed[FINGER_COUNT] = {600, 610, 620, 630, 640};
  Calibration calibration;
  CHECK(calibration.setFlexOpen(open));
  CHECK(calibration.setFlexClosed(closed));
  CHECK(calibration.setEmgBaseline(100u));
  CHECK(calibration.setEmgMvc(300u));
  CHECK(calibration.complete());

  CalibrationBlob blob;
  calibration.exportBlob(blob);
  CHECK(blob.magic == CALIBRATION_MAGIC);
  CHECK(blob.version == CALIBRATION_FORMAT_VERSION);
  CHECK(blob.crc == calibrationCrc(blob));

  Calibration restored;
  CHECK(loadCalibrationBlob(reinterpret_cast<const uint8_t *>(&blob), sizeof(blob), restored) == CAL_LOAD_OK);
  CHECK(restored.complete());
  CHECK(restored.flexOpen()[0] == 100u && restored.flexClosed()[4] == 640u);

  blob.crc ^= 1u;
  Calibration rejected;
  CHECK(loadCalibrationBlob(reinterpret_cast<const uint8_t *>(&blob), sizeof(blob), rejected) == CAL_LOAD_CORRUPT);
  CHECK(!rejected.complete());

  uint16_t saturated[FINGER_COUNT] = {0, 100, 100, 100, 100};
  Calibration invalid;
  CHECK(!invalid.setFlexOpen(saturated));
}

static void test_safety_logic() {
  CHECK(dutyMax(6.0f, true, 0u) > 0.99f);
  CHECK(dutyMax(7.2f, true, 0u) < 0.84f);
  CHECK(dutyMax(0.1f, false, 0u) < 0.69f);
  CHECK(dutyMax(7.2f, true, VBAT_MAX_AGE_MS + 1u) < 0.69f);
  CHECK(rampToward(0.0f, 1.0f, 0.2f) == 0.2f);
  CHECK(positionViolation(-1, 0, 10));
  CHECK(!positionViolation(5, 0, 10));

  StallDetector stall;
  stall.reset(INT32_MAX, UINT32_MAX - 20u);
  CHECK(!stall.update(INT32_MIN, 0.5f, 30u, 100u));
  CHECK(!stall.update(INT32_MIN, 0.0f, 140u, 100u));
  CHECK(!stall.update(INT32_MIN, 0.5f, 200u, 100u));
  CHECK(stall.update(INT32_MIN, 0.5f, 310u, 100u));
  CHECK(stall.stillMs() == 110u);

  Supervisor supervisor;
  Health health = {true, true, true, true, true, true, false};
  supervisor.beginSession(0u);
  supervisor.heartbeat(0u);
  CHECK(supervisor.observe(100u, health));
  CHECK(supervisor.observe(200u, Health{false, true, true, true, true, true, false}));
  CHECK(supervisor.state() == STATE_SAFE_STOP);
  CHECK(supervisor.error() == ERR_FLEX_INVALID);
  // Valid health and intermittent recovery do not clear a latched fault.
  CHECK(supervisor.observe(250u, health));
  CHECK(supervisor.state() == STATE_SAFE_STOP);
  CHECK(!supervisor.stop());
  CHECK(supervisor.state() == STATE_SAFE_STOP);
  CHECK(!supervisor.clearFault(Health{true, true, true, true, true, true, true}));
  CHECK(supervisor.clearFault(health));
  CHECK(supervisor.state() == STATE_IDLE);
}

static void test_bench() {
  BenchPlan plan;
  CHECK(parseBenchCommand("b 0,1,4 10 100", plan));
  CHECK(plan.motorMask == 0x13u && plan.dutyPercent == 10u && plan.durationMs == 100u);
  CHECK(!parseBenchCommand("b 0 10 100", plan));
  CHECK(parseBenchCommand("m 2 5 50", plan));
  CHECK(!parseBenchCommand("b 0,1,2 16 50", plan));
  CHECK(!parseBenchCommand("b 0,1,2 10 251", plan));
  CHECK(!parseBenchCommand("b 0,0 10 50", plan));
  BenchSafety safe = {true, true, true, true, false, false};
  CHECK(benchSafetyAllows(safe));
  safe.safeStop = true;
  CHECK(!benchSafetyAllows(safe));
  safe.safeStop = false;
  safe.estopPressed = true;
  CHECK(!benchSafetyAllows(safe));
}

static void test_parser_noise() {
  FrameParser parser;
  UartFrame frame;
  uint32_t seed = 0x12345678u;
  unsigned delivered = 0u;
  for (uint32_t i = 0u; i < 1000000u; ++i) {
    seed = seed * 1664525u + 1013904223u;
    uint8_t byte = static_cast<uint8_t>(seed >> 24);
    if (parser.feed(byte, frame)) {
      ++delivered;
      CHECK(frame.length <= UART_MAX_PAYLOAD);
      uint8_t wire[70];
      uint8_t length = buildFrame(wire, sizeof(wire), frame.type, frame.payload, frame.length);
      uint16_t crc = crc16CcittFalse(wire + 2, 2u + frame.length);
      CHECK(wire[length - 2u] == static_cast<uint8_t>(crc & 0xFFu));
      CHECK(wire[length - 1u] == static_cast<uint8_t>(crc >> 8));
    }
  }
  // The random stream may accidentally contain a valid frame, but every delivered
  // frame above was checked. Explicit valid frames must still be delivered bytewise.
  uint8_t payload[] = {OP_HEARTBEAT, 7u};
  uint8_t wire[70];
  uint8_t length = buildFrame(wire, sizeof(wire), FRAME_COMMAND, payload, sizeof(payload));
  bool valid = false;
  for (uint8_t i = 0; i < length; ++i) valid = parser.feed(wire[i], frame) || valid;
  CHECK(valid);
  (void)delivered;
}

int main() {
  test_protocol();
  test_calibration();
  test_safety_logic();
  test_bench();
  test_parser_noise();
  printf("host tests: %u OK\n", tests);
  return 0;
}
