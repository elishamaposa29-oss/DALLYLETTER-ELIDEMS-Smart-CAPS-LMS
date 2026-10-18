#!/usr/bin/env bash
set -Eeuo pipefail

diagnostics() {
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "::group::Android emulator diagnostics (failure status $status)"
    adb devices -l || true
    adb shell getprop sys.boot_completed || true
    adb shell getprop init.svc.bootanim || true
    adb shell dumpsys cpuinfo || true
    adb shell dumpsys meminfo || true
    adb logcat -d -t 4000 || true
    echo "::endgroup::"
  fi
  return "$status"
}
trap diagnostics EXIT

step() { echo "::group::Android smoke: $*"; date -u +%FT%TZ; }
step "wait for device"
timeout 90 adb wait-for-device
timeout 300 bash -c 'until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d "\r")" = "1" ]; do sleep 5; done'
step "verify Android boot complete"
test "$(timeout 30 adb shell getprop sys.boot_completed | tr -d "\r")" = "1"

step "wait for package manager"
# Wait for Android's package manager to become responsive, not just boot_completed.
ready=0
for attempt in $(seq 1 24); do
  if timeout 20 adb shell cmd package list packages >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 5
done
test "$ready" = "1"
step "configure animations and clear logcat"
timeout 30 adb shell settings put global window_animation_scale 0 || true
timeout 30 adb shell settings put global transition_animation_scale 0 || true
timeout 30 adb shell settings put global animator_duration_scale 0 || true
timeout 30 adb logcat -c

step "install and launch version 1.0.0"
# First install and launch must remain covered by the crash check.
timeout 180 adb install /tmp/dallyletter-v1.apk
timeout 30 adb shell pm path com.dallyletter.elidems | grep -q "package:"
timeout 45 adb shell monkey -p com.dallyletter.elidems 1
sleep 8
step "check launch crash log"
if timeout 30 adb logcat -d -t 8000 | awk '/FATAL EXCEPTION/ { in_exception=1; count=0 } in_exception { if (/Process: com\.dallyletter\.elidems/) found=1; if (++count > 20) in_exception=0 } END { exit !found }'; then
  echo "Android app crashed after first install"
  exit 1
fi

step "upgrade to version 1.0.1 without uninstalling"
# Upgrade the installed package in place; do not uninstall between versions.
timeout 180 adb install -r artifacts/dallyletter-mobile/android/app/build/outputs/apk/debug/app-debug.apk
adb shell pm path com.dallyletter.elidems | grep -q "package:"
timeout 30 adb shell dumpsys package com.dallyletter.elidems | grep -E "versionCode=2|versionName=1\.0.1"
adb shell monkey -p com.dallyletter.elidems 1
sleep 8
if adb logcat -d -t 8000 | awk '/FATAL EXCEPTION/ { in_exception=1; count=0 } in_exception { if (/Process: com\.dallyletter\.elidems/) found=1; if (++count > 20) in_exception=0 } END { exit !found }'; then
  echo "Android app crashed during upgrade smoke test"
  exit 1
fi
step "all emulator smoke checks passed"
echo "::endgroup::"
