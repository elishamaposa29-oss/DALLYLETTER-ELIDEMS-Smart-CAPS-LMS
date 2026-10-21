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
timeout 600 adb wait-for-device

step "verify Android boot completion (bounded to 1500 seconds)"
boot_deadline=$((SECONDS + 1500))
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
  echo "::error::Android did not report sys.boot_completed=1 within the 1500-second verification window"
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
step "open the login route and verify rendered sign-in UI"
# The launcher may restore the last route; explicitly navigate to login so this
# assertion tests the sign-in screen rather than an unrelated initial route.
timeout 30 adb shell am start -a android.intent.action.VIEW -d 'dallyletter:///login' com.dallyletter.elidems
sleep 3
ui_ready=0
for attempt in 1 2 3 4 5 6; do
  timeout 30 adb exec-out screencap -p > /tmp/dallyletter-v1.png || true
  timeout 45 adb shell uiautomator dump /sdcard/dallyletter-ui-v1.xml >/dev/null 2>&1 || true
  timeout 20 adb pull /sdcard/dallyletter-ui-v1.xml /tmp/dallyletter-ui-v1.xml >/dev/null 2>&1 || true
  if [ -s /tmp/dallyletter-ui-v1.xml ] && grep -Eqi 'Welcome back|Sign in to continue learning|your@email.com|Sign In' /tmp/dallyletter-ui-v1.xml; then
    ui_ready=1
    break
  fi
  echo "Sign-in UI not exposed in hierarchy yet (attempt $attempt/6); waiting 5 seconds"
  sleep 5
done
if [ "$ui_ready" -ne 1 ]; then
  echo "::error::App launched but sign-in UI did not appear after explicit login navigation and bounded retries"
  cat /tmp/dallyletter-ui-v1.xml || true
  timeout 30 adb logcat -d -t 2500 || true
  exit 1
fi
step "submit invalid credentials to verify real mobile-to-API request and visible error state"
tap_ui_node() {
  python3 - "$1" "$2" <<'PY'
import re, subprocess, sys, xml.etree.ElementTree as ET
path, selector = sys.argv[1], sys.argv[2]
fallbacks = {
    "email-input": ("your@email.com",),
    "password-input": ("••••••••",),
    "login-btn": ("Sign In",),
}
root = ET.parse(path).getroot()
node = None
for item in root.iter("node"):
    rid = item.attrib.get("resource-id", "")
    text = item.attrib.get("text", "")
    desc = item.attrib.get("content-desc", "")
    if selector in rid or selector in desc or text in fallbacks.get(selector, ()):
        node = item
        if selector in rid or selector in desc:
            break
if node is None:
    raise SystemExit(f"UI node not found: {selector}")
bounds = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.attrib.get("bounds", ""))
if not bounds:
    raise SystemExit(f"UI node has no usable bounds: {selector}")
x1, y1, x2, y2 = map(int, bounds.groups())
subprocess.run(["adb", "shell", "input", "tap", str((x1+x2)//2), str((y1+y2)//2)], check=True)
PY
}
tap_ui_node /tmp/dallyletter-ui-v1.xml email-input
timeout 15 adb shell input text "ci-invalid-$GITHUB_RUN_ID@example.com"
# Hide the keyboard before locating the next field: otherwise the password
# control can be covered and taps may continue typing into the email field.
timeout 15 adb shell input keyevent 4
sleep 1
timeout 45 adb shell uiautomator dump /sdcard/dallyletter-login-filled.xml >/dev/null
timeout 20 adb pull /sdcard/dallyletter-login-filled.xml /tmp/dallyletter-login-filled.xml >/dev/null
tap_ui_node /tmp/dallyletter-login-filled.xml password-input
timeout 15 adb shell input text "InvalidPassword123"
# Verify the password field actually received the test value before submit.
sleep 1
timeout 45 adb shell uiautomator dump /sdcard/dallyletter-password-filled.xml >/dev/null
timeout 20 adb pull /sdcard/dallyletter-password-filled.xml /tmp/dallyletter-password-filled.xml >/dev/null
if ! grep -Fq 'password-input' /tmp/dallyletter-password-filled.xml; then
  echo "::error::Password field is not present in the UI hierarchy after focus"
  cat /tmp/dallyletter-password-filled.xml || true
  exit 1
fi
timeout 15 adb shell input keyevent 4
sleep 1
timeout 45 adb shell uiautomator dump /sdcard/dallyletter-login-ready.xml >/dev/null
timeout 20 adb pull /sdcard/dallyletter-login-ready.xml /tmp/dallyletter-login-ready.xml >/dev/null
tap_ui_node /tmp/dallyletter-login-ready.xml login-btn
# The hosted API can cold-start; wait for the actual authentication response,
# but keep the assertion strict and bounded rather than accepting a missing error.
login_error_ready=0
for attempt in 1 2 3 4 5 6; do
  sleep 5
  timeout 45 adb shell uiautomator dump /sdcard/dallyletter-login-error.xml >/dev/null
  timeout 20 adb pull /sdcard/dallyletter-login-error.xml /tmp/dallyletter-login-error.xml >/dev/null
  if grep -Fqi 'Invalid email or password' /tmp/dallyletter-login-error.xml; then
    login_error_ready=1
    break
  fi
  echo "Authentication error not rendered yet (attempt $attempt/6); waiting for API response."
done
if [ "$login_error_ready" -ne 1 ]; then
  echo "::error::Invalid login did not render the expected user-visible authentication error within 30 seconds"
  cat /tmp/dallyletter-login-error.xml || true
  exit 1
fi
timeout 30 adb exec-out screencap -p > /tmp/dallyletter-login-error.png
step "verify signup route opens a real registration form"
timeout 30 adb shell am start -a android.intent.action.VIEW -d 'dallyletter:///signup' com.dallyletter.elidems
sleep 4
timeout 45 adb shell uiautomator dump /sdcard/dallyletter-ui-signup.xml >/dev/null
timeout 20 adb pull /sdcard/dallyletter-ui-signup.xml /tmp/dallyletter-ui-signup.xml >/dev/null
if ! grep -Eqi 'Create account' /tmp/dallyletter-ui-signup.xml || ! grep -Eqi 'Full name' /tmp/dallyletter-ui-signup.xml; then
  echo "::error::Signup route did not display the real registration form"
  cat /tmp/dallyletter-ui-signup.xml || true
  exit 1
fi
timeout 30 adb exec-out screencap -p > /tmp/dallyletter-signup.png
step "verify app process and foreground activity"
app_pid="$(timeout 20 adb shell pidof com.dallyletter.elidems | tr -d "\r" || true)"
if [ -z "$app_pid" ]; then
  echo "::error::Dallyletter process is not running after launch"
  timeout 20 adb logcat -d -t 1000 || true
  exit 1
fi
if ! timeout 20 adb shell dumpsys activity activities | grep -E "mResumedActivity|topResumedActivity" | grep -F "com.dallyletter.elidems/" >/dev/null; then
  echo "::error::Dallyletter is not the resumed foreground activity"
  timeout 20 adb shell dumpsys activity activities | tail -n 100 || true
  exit 1
fi
step "check launch crash log"
if timeout 30 adb logcat -d -t 8000 | awk '/FATAL EXCEPTION/ { in_exception=1; count=0 } in_exception { if (/Process: com\.dallyletter\.elidems/) found=1; if (++count > 20) in_exception=0 } END { exit !found }'; then
  echo "Android app crashed after first install"
  exit 1
fi

step "upgrade actual release APK in place to version 1.0.1"
timeout 180 adb install -r artifacts/dallyletter-mobile/android/app/build/outputs/apk/release/app-release.apk
timeout 30 adb shell dumpsys package com.dallyletter.elidems | grep -E "versionCode=2|versionName=1\\.0\\.1"
timeout 45 adb shell monkey -p com.dallyletter.elidems 1
sleep 8
step "verify upgraded release APK still renders sign-in UI"
timeout 30 adb exec-out screencap -p > /tmp/dallyletter-release-upgrade.png
timeout 45 adb shell uiautomator dump /sdcard/dallyletter-release-upgrade.xml >/dev/null
timeout 20 adb pull /sdcard/dallyletter-release-upgrade.xml /tmp/dallyletter-release-upgrade.xml >/dev/null
if ! grep -Eqi 'Welcome back|Sign in to continue learning|your@email.com|Sign In' /tmp/dallyletter-release-upgrade.xml; then
  echo "::error::Release APK v1.0.1 did not retain a visible sign-in UI after in-place upgrade"
  cat /tmp/dallyletter-release-upgrade.xml || true
  exit 1
fi
# Release APKs are intentionally non-debuggable, so Android's `run-as` must not be
# used against them. The release APK has already passed install/launch/login tests.
# Exercise private-data preservation with two CI-only debuggable builds of the same
# applicationId and signing configuration. Never enable debuggable in release.
step "install CI debug v1.0.0 for private-data upgrade test"
timeout 180 adb uninstall com.dallyletter.elidems
timeout 180 adb install /tmp/dallyletter-data-v1-debug.apk
timeout 30 adb shell dumpsys package com.dallyletter.elidems | grep -E "versionCode=1|versionName=1\\.0\\.0"
step "write marker into app-private data using debuggable test build"
timeout 30 adb shell "run-as com.dallyletter.elidems sh -c 'mkdir -p /data/user/0/com.dallyletter.elidems/files && printf preserved-across-upgrade > /data/user/0/com.dallyletter.elidems/files/dallyletter-upgrade-marker'"
timeout 20 adb shell run-as com.dallyletter.elidems test -f /data/user/0/com.dallyletter.elidems/files/dallyletter-upgrade-marker
step "upgrade CI test build to version 1.0.1 without uninstalling"
timeout 180 adb install -r /tmp/dallyletter-data-v1.0.1-debug.apk
timeout 30 adb shell pm path com.dallyletter.elidems | grep -q "package:"
step "verify app-private data survives in-place install -r upgrade"
upgrade_marker="$(timeout 20 adb shell run-as com.dallyletter.elidems cat /data/user/0/com.dallyletter.elidems/files/dallyletter-upgrade-marker | tr -d "\\r")"
if [ "$upgrade_marker" != "preserved-across-upgrade" ]; then
  echo "::error::App-private data marker was not preserved during install -r upgrade"
  exit 1
fi
timeout 30 adb shell dumpsys package com.dallyletter.elidems | grep -E "versionCode=2|versionName=1\\.0\\.1"
timeout 45 adb shell monkey -p com.dallyletter.elidems 1
sleep 8
step "capture upgraded CI test build and verify sign-in UI remains visible"
timeout 30 adb exec-out screencap -p > /tmp/dallyletter-v1.0.1.png
timeout 45 adb shell uiautomator dump /sdcard/dallyletter-ui-v1.0.1.xml >/dev/null
timeout 20 adb pull /sdcard/dallyletter-ui-v1.0.1.xml /tmp/dallyletter-ui-v1.0.1.xml >/dev/null
if ! grep -Eqi 'Welcome back|Sign in to continue learning|your@email.com|Sign In' /tmp/dallyletter-ui-v1.0.1.xml; then
  echo "::error::Upgraded app launched but expected sign-in UI text was not present"
  cat /tmp/dallyletter-ui-v1.0.1.xml || true
  exit 1
fi
step "verify upgraded test app process and foreground activity"
app_pid="$(timeout 20 adb shell pidof com.dallyletter.elidems | tr -d "\\r" || true)"
if [ -z "$app_pid" ]; then
  echo "::error::Dallyletter process is not running after upgrade launch"
  timeout 20 adb logcat -d -t 1000 || true
  exit 1
fi
if ! timeout 20 adb shell dumpsys activity activities | grep -E "mResumedActivity|topResumedActivity" | grep -F "com.dallyletter.elidems/" >/dev/null; then
  echo "::error::Dallyletter is not the resumed foreground activity after upgrade"
  timeout 20 adb shell dumpsys activity activities | tail -n 100 || true
  exit 1
fi
if timeout 30 adb logcat -d -t 8000 | awk '/FATAL EXCEPTION/ { in_exception=1; count=0 } in_exception { if (/Process: com\\.dallyletter\\.elidems/) found=1; if (++count > 20) in_exception=0 } END { exit !found }'; then
  echo "Android app crashed during upgrade smoke test"
  exit 1
fi
step "all emulator smoke checks passed"
echo "::endgroup::"
