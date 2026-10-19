#!/usr/bin/env bash
set -Eeuo pipefail

diagnostics() {
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "::group::Android emulator diagnostics (failure status $status)"
    adb devices -l || true
    timeout 15 adb shell getprop sys.boot_completed || true
    timeout 15 adb shell getprop init.svc.bootanim || true
    timeout 20 adb shell dumpsys cpuinfo || true
    timeout 20 adb shell dumpsys meminfo || true
    timeout 20 adb logcat -d -t 4000 || true
    echo "::endgroup::"
  fi
  return "$status"
}
trap diagnostics EXIT

step() { echo "::group::Android smoke: $*"; date -u +%FT%TZ; }
step "wait for device"
timeout 120 adb wait-for-device

step "verify Android boot completion (bounded to 1200 seconds)"
boot_deadline=$((SECONDS + 1200))
boot_ready=0
boot_state=""
while [ "$SECONDS" -lt "$boot_deadline" ]; do
  boot_state="$(timeout 10 adb shell getprop sys.boot_completed 2>/dev/null | tr -d "\r" || true)"
  if [ "$boot_state" = "1" ]; then
    boot_ready=1
    break
  fi
  remaining=$((boot_deadline - SECONDS))
  if [ "$remaining" -le 0 ]; then break; fi
  echo "Android boot not confirmed yet (sys.boot_completed=$boot_state, ${remaining}s remaining)"
  sleep "$((remaining < 5 ? remaining : 5))"
done
if [ "$boot_ready" -ne 1 ]; then
  echo "::error::Android did not report sys.boot_completed=1 within the 1200-second verification window"
  exit 1
fi
step "verify Android boot complete"
test "$(timeout 20 adb shell getprop sys.boot_completed | tr -d "\r")" = "1"

step "wait for package manager"
ready=0
for attempt in $(seq 1 24); do
  if timeout 20 adb shell cmd package list packages >/dev/null 2>&1; then
    ready=1
    break
  fi
  echo "Package manager not ready (attempt $attempt/24)"
  sleep 5
done
if [ "$ready" -ne 1 ]; then
  echo "::error::Android package manager did not become responsive within 120 seconds"
  exit 1
fi

step "configure animations and clear logcat"
timeout 30 adb shell settings put global window_animation_scale 0 || true
timeout 30 adb shell settings put global transition_animation_scale 0 || true
timeout 30 adb shell settings put global animator_duration_scale 0 || true
timeout 30 adb logcat -c

step "install and launch version 1.0.0"
timeout 180 adb install /tmp/dallyletter-v1.apk
timeout 30 adb shell pm path com.dallyletter.elidems | grep -q "package:"
timeout 45 adb shell monkey -p com.dallyletter.elidems 1
sleep 8
step "check launch crash log"
if timeout 30 adb logcat -d -t 8000 | awk '/FATAL EXCEPTION/ { in_exception=1; count=0 } in_exception { if (/Process: com\\.dallyletter\\.elidems/) found=1; if (++count > 20) in_exception=0 } END { exit !found }'; then
  echo "Android app crashed after first install"
  exit 1
fi

step "upgrade to version 1.0.1 without uninstalling"
timeout 180 adb install -r artifacts/dallyletter-mobile/android/app/build/outputs/apk/debug/app-debug.apk
timeout 30 adb shell pm path com.dallyletter.elidems | grep -q "package:"
timeout 30 adb shell dumpsys package com.dallyletter.elidems | grep -E "versionCode=2|versionName=1\\.0\\.1"
timeout 45 adb shell monkey -p com.dallyletter.elidems 1
sleep 8
if timeout 30 adb logcat -d -t 8000 | awk '/FATAL EXCEPTION/ { in_exception=1; count=0 } in_exception { if (/Process: com\\.dallyletter\\.elidems/) found=1; if (++count > 20) in_exception=0 } END { exit !found }'; then
  echo "Android app crashed during upgrade smoke test"
  exit 1
fi
step "all emulator smoke checks passed"
echo "::endgroup::"
