# Dallyletter Elidems Android build, emulator, and release verification playbook

## Exact incident and root cause

**Run:** Mobile Android Build and Smoke Test, run 39483898929.  
**Application ID:** `com.dallyletter.elidems`.  
**Failure:** `run-as: package not debuggable: com.dallyletter.elidems`.  
**Meaning:** The test invokes Android's `run-as` against an `assembleRelease` APK. Release applications are correctly non-debuggable, so Android refuses access to the app's private files. This is a test-design defect, not evidence that Android failed to boot or the app crashed.

The logged run had already passed: emulator boot completion, package-manager readiness, first APK installation and launch, visible sign-in UI, invalid-credential error UI, signup form, foreground process/activity, and initial crash-log check. The first reported failing assertion was the private-data marker step.

**Do not** set `debuggable true` on the release APK, uninstall before the upgrade assertion, skip the marker assertion, or turn the failed test green without testing data preservation.

## Exact solution

1. Keep the production/release APK non-debuggable.
2. Build two **CI-only debug APKs** with the same package ID and the same CI debug signing key: version 1.0.0 / versionCode 1, then version 1.0.1 / versionCode 2.
3. Install and test the **release APK** independently for real launch, visible sign-in UI, invalid credentials and visible error, registration UI, foreground activity, and crash logs.
4. For the private-data upgrade gate only, install the v1 debug test APK, write a marker through `adb shell run-as`, then use `adb install -r` to upgrade to the v1.0.1 debug APK. Do not uninstall between those two debug installs.
5. Read the marker back with `run-as`, assert the value exactly, verify versionCode/versionName, relaunch, and assert the UI/process/crash state.
6. Keep CI-only debug APKs in a separate, one-day artifact. Never include them in the user-facing release APK artifact.

## Standalone APK vs CI debug APK

A separate smoke run exposed another test-design defect: an `assembleDebug` APK launched into React Native's **“Unable to load script”** screen because it had no Metro server. That does not prove the standalone release APK is broken; debug variants can expect Metro. For user-facing verification, install the `assembleRelease` APK and assert its embedded `assets/index.android.bundle` exists before emulator testing. Use the paired debug APKs only for the private-data marker test, never as the release candidate or as a substitute for release UI checks.

When an initial launch does not show the login screen, explicitly open `dallyletter:///login`, capture/retry the UI hierarchy within a bounded deadline, and assert the actual sign-in fields and error state. Do not weaken those assertions to accept the React Native bundle error screen.

Example commands (the workflow must build and verify both APKs with the same CI debug keystore):

```bash
# Verify release package remains non-debuggable; install and test it separately.
adb install /tmp/dallyletter-v1.apk
adb shell pm path com.dallyletter.elidems
adb shell monkey -p com.dallyletter.elidems 1

# CI-only data-preservation test: both APKs must be debuggable and signed alike.
adb install /tmp/dallyletter-data-v1-debug.apk
adb shell run-as com.dallyletter.elidems sh -c \
  'mkdir -p files && printf "preserved-across-upgrade" > files/dallyletter-upgrade-marker'
adb install -r /tmp/dallyletter-data-v1.0.1-debug.apk
test "$(adb shell run-as com.dallyletter.elidems cat files/dallyletter-upgrade-marker | tr -d '\r')" = "preserved-across-upgrade"
adb shell dumpsys package com.dallyletter.elidems | grep -E 'versionCode=2|versionName=1\.0\.1'
adb shell monkey -p com.dallyletter.elidems 1
```

## Emulator reliability: commands and diagnostics

Use a disposable GitHub Actions runner; never relax host-device permissions on a personal/shared machine.

```bash
set -Eeuo pipefail
adb start-server
"$ANDROID_HOME/emulator/emulator" -list-avds
"$ANDROID_HOME/emulator/emulator" -accel-check
adb devices -l
adb wait-for-device
adb shell getprop sys.boot_completed
adb shell cmd package list packages >/dev/null
adb shell getprop init.svc.bootanim
adb logcat -d -t 4000
```

- Ensure `android-actions/setup-android@v3` runs before `sdkmanager`.
- Install the requested platform tools, emulator, Android platform, and matching system image; accept SDK licences.
- Install host dependency `libpulse0` where required; set `LD_LIBRARY_PATH` to the SDK emulator's bundled library directories and check `ldd` output for `not found`.
- Start ADB **before** QEMU. Check `-accel-check`; use KVM only if genuinely usable. Otherwise use explicit `-accel off` and allow sufficient boot time.
- Verify each milestone independently: ADB transport, `sys.boot_completed=1`, package-manager responsiveness. Do not infer boot success from a live emulator PID alone.
- Use bounded `timeout` values, bounded retries, and `trap`-based diagnostics. On failure preserve emulator logs, `adb devices -l`, boot properties, CPU/memory dumps, logcat, screenshots and UI hierarchy XML.
- Avoid broad grep-only UI checks where possible: navigate to the explicit route, retry hierarchy capture within a bounded window, and assert actual visible form fields and error text. Never remove the assertion just because it is flaky.
- Keep emulator boot-only diagnostics separate from full APK install/launch/login/upgrade verification. A boot-only green check does not prove the app is usable.

## Common failures and correct responses

| Symptom | Correct response |
|---|---|
| `sdkmanager: command not found` | Configure Android SDK first with `android-actions/setup-android@v3`; then install packages. |
| Emulator exits with missing `libpulse.so.0` | Install `libpulse0` on the ephemeral Linux runner and inspect QEMU's shared-library resolution. |
| `/dev/kvm` absent/unusable | Detect acceleration; use explicit software emulation and a realistic boot deadline rather than falsely reporting an Android boot failure. |
| ADB daemon race | Run `adb start-server` before launching the emulator. |
| Boot property never becomes `1` | Capture ADB state, boot properties, emulator/QEMU logs and resource diagnostics; fix the actual boot issue. Do not skip the boot assertion. |
| First UI hierarchy misses sign-in text | Explicitly open `dallyletter:///login`, retry bounded captures, save screenshots/XML/logcat, and retain the real UI assertion. |
| `run-as: package not debuggable` | Test release UI separately; use paired CI-only debug builds for private-data persistence. Never make the release debuggable. |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | Ensure v1 and v1.0.1 have identical application ID and signing certificate; inspect `apksigner verify --print-certs`. |
| Marker missing after update | Confirm `adb install -r` was used without uninstall, the APKs share signing identity/package ID, versionCode increases, and marker write/read both target the same app-private path. |
| API smoke check fails | Check the configured deployed Render API health endpoint, response code/body, cold-start delay, and mobile base URL. Do not replace real API validation with a mocked success. |

## Required acceptance gates before declaring the mobile app usable

- [ ] Release APK builds and contains the embedded JS bundle.
- [ ] Emulator reaches `sys.boot_completed=1` and package manager responds.
- [ ] Release APK installs and launches.
- [ ] Real sign-in form is visible.
- [ ] Invalid credentials produce the expected visible error from the real API request.
- [ ] Registration route renders the actual form.
- [ ] App process is alive, activity is foregrounded, and no app crash is logged.
- [ ] Paired CI debug test APKs prove marker preservation through `install -r` from version 1.0.0 to 1.0.1.
- [ ] Release APK artifacts are kept separate from CI-only debug APKs.
- [ ] Deployed Render API health check succeeds.
- [ ] Required checks pass and unique PR changes are reconciled before merge/cleanup.

## PR #54 reconciliation

PR #54 proposes a production API base-URL fallback and better login-response/error handling. Do not close or merge it based solely on the emulator diagnostics fix: inspect its source diff, reconcile unique runtime/login changes against current main and the verified branch, then run typecheck, release build, real sign-in/error checks and emulator tests. Preserve the Render/Vercel deployment architecture; do not introduce Replit-only dependencies.

## Current work record

This playbook is committed alongside the PR #56 smoke-test correction. Treat the workflow run as **not yet verified** until the updated workflow completes all gates above. Never report an emulator or app check as passing merely because a fix was committed or a rerun was queued.
