#!/usr/bin/env bash
set -Eeuo pipefail

diagnostics() {
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "::group::Android emulator diagnostics (failure status $status)"
    timeout 10 adb devices -l || true
    timeout 10 adb get-state || true
    timeout 10 adb shell getprop sys.boot_completed || true
    timeout 10 adb shell getprop init.svc.bootanim || true
    timeout 12 adb shell dumpsys cpuinfo | tail -n 35 || true
    timeout 12 adb shell dumpsys meminfo | head -n 45 || true
    timeout 15 adb logcat -d -t 500 | tail -n 180 || true
    echo "::endgroup::"
  fi
  return "$status"
}
trap diagnostics EXIT

step() { echo "::group::Android smoke: $*"; date -u +%FT%TZ; }
step "start adb and wait for emulator transport (up to 300 seconds)"
adb start-server
deadline=$((SECONDS + 300))
device_ready=0
while [ "$SECONDS" -lt "$deadline" ]; do
  state="$(timeout 8 adb get-state 2>/dev/null || true)"
  if [ "$state" = "device" ]; then
    device_ready=1
    break
  fi
  echo "Emulator transport not ready (state=${state:-unavailable}); waiting..."
  timeout 8 adb devices -l || true
  sleep 5
done
if [ "$device_ready" -ne 1 ]; then
  echo "::error::Emulator transport did not become ready within 300 seconds"
  exit 124
fi

step "verify Android boot completion (bounded to 1200 seconds)"
boot_deadline=$((SECONDS + 1200))
boot_ready=0
boot_state=""
while [ "$SECONDS" -lt "$boot_deadline" ]; do
  boot_state="$(timeout 12 adb shell getprop sys.boot_completed 2>/dev/null | tr -d "\r" || true)"
  if [ "$boot_state" = "1" ]; then
    boot_ready=1
    break
  fi
  remaining=$((boot_deadline - SECONDS))
  if [ "$remaining" -le 0 ]; then break; fi
  echo "Android boot not confirmed yet (sys.boot_completed=${boot_state:-unavailable}, ${remaining}s remaining)"
  sleep "$((remaining < 5 ? remaining : 5))"
done
if [ "$boot_ready" -ne 1 ]; then
  echo "::error::Android did not report sys.boot_completed=1 within the 1200-second verification window"
  exit 1
fi

step "wait for package manager (up to 180 seconds)"
ready=0
for attempt in $(seq 1 36); do
  if timeout 12 adb shell cmd package list packages >/dev/null 2>&1; then
    ready=1
    break
  fi
  echo "Package manager not ready (attempt $attempt/36)"
  sleep 5
done
if [ "$ready" -ne 1 ]; then
  echo "::error::Android package manager did not become responsive within 180 seconds"
  exit 1
fi

step "configure animations and clear app logs"
timeout 15 adb shell settings put global window_animation_scale 0 || true
timeout 15 adb shell settings put global transition_animation_scale 0 || true
timeout 15 adb shell settings put global animator_duration_scale 0 || true
timeout 15 adb logcat -c

assert_no_app_crash() {
  local stage="$1"
  local logs
  logs="$(timeout 20 adb logcat -d -t 5000 || true)"
  if printf '%s\n' "$logs" | grep -E -A 20 'FATAL EXCEPTION' | grep -Fq 'com.dallyletter.elidems'; then
    echo "::error::Android app crash detected: $stage"
    printf '%s\n' "$logs" | grep -E -A 20 'FATAL EXCEPTION' | tail -n 80
    return 1
  fi
}

step "install and launch first APK"
timeout 180 adb install /tmp/dallyletter-v1.apk
timeout 30 adb shell pm path com.dallyletter.elidems | grep -q "package:"
timeout 45 adb shell monkey -p com.dallyletter.elidems 1
sleep 8
assert_no_app_crash "first install"

step "upgrade in place to version 1.0.1"
timeout 180 adb install -r artifacts/dallyletter-mobile/android/app/build/outputs/apk/debug/app-debug.apk
timeout 30 adb shell pm path com.dallyletter.elidems | grep -q "package:"
timeout 30 adb shell dumpsys package com.dallyletter.elidems | grep -E "versionCode=2|versionName=1\.0\.1"
timeout 45 adb shell monkey -p com.dallyletter.elidems 1
sleep 8
assert_no_app_crash "in-place upgrade"

step "all emulator install/launch/upgrade checks passed"
echo "::endgroup::"
