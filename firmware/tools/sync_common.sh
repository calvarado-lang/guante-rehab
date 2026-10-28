#!/usr/bin/env bash
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"

for node in nodeA nodeB nodeC; do
  cp "$ROOT/common/guante_config.h" "$ROOT/$node/guante_config.h"
  cp "$ROOT/common/guante_protocol.h" "$ROOT/$node/guante_protocol.h"
  cp "$ROOT/common/guante_logic.h" "$ROOT/$node/guante_logic.h"
done

echo "common headers synchronized to nodeA, nodeB and nodeC"
