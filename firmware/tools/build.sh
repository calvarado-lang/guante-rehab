#!/usr/bin/env bash
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
CLI="${ARDUINO_CLI:-arduino-cli}"

"$ROOT/tools/sync_common.sh"
"$CLI" compile --fqbn esp32:esp32:esp32s3:CDCOnBoot=cdc "$ROOT/nodeA"
"$CLI" compile --fqbn esp32:esp32:esp32s3:CDCOnBoot=cdc "$ROOT/nodeB"
"$CLI" compile --fqbn esp32:esp32:esp32c3:CDCOnBoot=cdc "$ROOT/nodeC"
