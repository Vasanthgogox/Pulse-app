---
description: Rebuild the release APK and update it on the connected phone
---

# /apk — Build & update the release APK on device

Goal: rebuild the Android **release** APK with the latest code and re-install it to
the connected phone, keeping app data. The installed APK runs standalone (works with
the cable disconnected — the JS bundle is baked in).

## Steps (run these in order, stop on first failure)

1. **Check a device is connected**
   ```bash
   adb devices
   ```
   If no device shows `device` next to it, tell the user to plug in the phone,
   unlock it, and accept the USB-debugging prompt. Do not continue.

2. **Build the release APK**
   ```bash
   cd /Users/nihas/Desktop/q-web/android && ./gradlew assembleRelease
   ```
   Takes ~3–6 min. If it fails, show the last ~40 lines of output and stop.
   (No clean needed for normal changes — Gradle rebuilds only what changed.
   If the user reports a stale/weird build, run `./gradlew clean` first.)

3. **Install over the existing app (keeps data)**
   ```bash
   cd /Users/nihas/Desktop/q-web/android
   APK=$(ls -t app/build/outputs/apk/release/*.apk | head -1)
   adb install -r "$APK"
   ```
   - `-r` reinstalls and keeps existing data/login.
   - If it fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE` (signature mismatch),
     uninstall first then install — this WIPES app data, so warn the user:
     `adb uninstall com.pulse.app && adb install "$APK"`

4. **Launch and verify no crash**
   ```bash
   adb shell monkey -p com.pulse.app -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
   sleep 4
   adb logcat -d -t 200 | grep -iE "FATAL|AndroidRuntime" | head -15
   adb shell pidof com.pulse.app && echo "APP RUNNING OK" || echo "app NOT running"
   ```

5. **Report** briefly: built + installed + running, per the user's report style.

## Notes
- Package id: `com.pulse.app`
- Release build is signed with the **debug keystore** (project default) — fine for
  on-device testing, NOT for Play Store upload (that needs a production keystore).
- After installing, the cable can be unplugged; the app runs on its own.
