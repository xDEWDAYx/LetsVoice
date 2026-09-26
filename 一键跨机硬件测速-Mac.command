#!/bin/bash

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
/bin/bash "$PROJECT_ROOT/scripts/benchmark/run-cross-machine-benchmark-macos.sh" "$@"
STATUS=$?

if [[ $# -eq 0 ]]; then
  printf '\n按回车键关闭窗口…'
  IFS= read -r _
fi

exit "$STATUS"
