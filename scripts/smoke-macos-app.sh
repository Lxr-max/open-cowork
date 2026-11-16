#!/usr/bin/env bash
# Launch a packaged Mac app with --smoke-test. Pass "rosetta" as the second
# argument to run an x64 build on Apple Silicon.
# A background sleep is the timeout: macOS runners ship bash 3.2, which has
# no wait timeout, and GNU timeout is not installed there by default.
set -euo pipefail

app_dir="${1:-}"
mode="${2:-}"
if [ -z "$app_dir" ] || [ ! -d "$app_dir" ]; then
  echo "usage: $0 <release/mac-arm64|release/mac-x64> [rosetta]" >&2
  exit 2
fi

app_name="$(find "$app_dir" -maxdepth 1 -name '*.app' -print | head -1)"
if [ -z "$app_name" ]; then
  echo "::error::No .app bundle found in $app_dir"
  exit 1
fi

executable="$app_name/Contents/MacOS/$(basename "$app_name" .app)"
if [ ! -f "$executable" ]; then
  echo "::error::App executable not found: $executable"
  exit 1
fi

if [ "$mode" = "rosetta" ]; then
  echo "Launching: arch -x86_64 $executable --smoke-test"
  arch -x86_64 "$executable" --smoke-test 2>&1 &
else
  echo "Launching: $executable --smoke-test"
  "$executable" --smoke-test 2>&1 &
fi
app_pid=$!
timeout_flag="$(mktemp)"

(
  sleep 30
  echo 1 > "$timeout_flag"
  kill "$app_pid" 2>/dev/null || true
) &
timer_pid=$!

exit_code=0
wait "$app_pid" || exit_code=$?
kill "$timer_pid" 2>/dev/null || true
wait "$timer_pid" 2>/dev/null || true

if [ -s "$timeout_flag" ]; then
  rm -f "$timeout_flag"
  echo "::error::Launch smoke test timed out after 30s"
  exit 1
fi
rm -f "$timeout_flag"

if [ "$exit_code" -eq 0 ]; then
  echo "Launch smoke test passed"
  exit 0
fi

echo "::error::Launch smoke test failed with exit code ${exit_code}"
exit 1
