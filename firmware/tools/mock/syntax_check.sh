#!/usr/bin/env bash
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
CXX="${CXX:-g++}"
COMMON=("-std=c++11" "-Wall" "-Wextra" "-fsyntax-only" "-x" "c++"
  "-I$ROOT/tools/mock" "-I$ROOT/common")

for node in nodeA nodeB nodeC; do
  "$CXX" "${COMMON[@]}" "-I$ROOT/$node" "$ROOT/$node/$node.ino"
done

echo "syntax_check: nodeA nodeB nodeC OK"
