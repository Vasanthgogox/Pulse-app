# Method 2: Android App Parsing (Kotlin/Java)

This folder contains the native Android implementation for **parsing incoming SMS messages** on a physical Android device. Use this when you want the app to automatically read OTP/codes from SMS (e.g. for trip OTP claim or auth verification).

## Overview

- **RECEIVE_SMS** permission is declared in the manifest.
- A **BroadcastReceiver** wakes when the device receives an SMS.
- Incoming messages are delivered as **PDUs** (Protocol Description Units); we convert them to readable text and extract the code.

## Integration (Expo / React Native)

1. **Prebuild** (if using Expo managed workflow):
   ```bash
   npx expo prebuild
   ```
2. **Copy files** into the generated `android/` project:
   - Merge `AndroidManifest.snippet.xml` into `android/app/src/main/AndroidManifest.xml` (add `<uses-permission>` and `<receiver>` inside `<application>`).
   - Copy `SmsReceiver.kt` into `android/app/src/main/kotlin/<your.package>/` (create the package folder if needed; use your app’s package name).
3. **Optional:** Use an Expo config plugin to inject the permission and receiver so they survive `expo prebuild`; otherwise re-apply after each prebuild.

## Permissions

In `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.RECEIVE_SMS" />
```

At runtime, request **SMS** (and optionally **READ_SMS** if you need to read existing messages) using Android’s permission APIs or a library (e.g. `expo-modules-core` / custom native module).

## Receiver behavior

- Listens for `android.provider.Telephony.SMS_RECEIVED`.
- Loops over `pdus` from the intent, builds `SmsMessage` from each PDU.
- Reads `messageBody` and `originatingAddress`.
- Calls `extractCode(body)` to get a numeric/code string; you can then pass it to JS (e.g. via an Expo module or event) for OTP claim or verification.

## Files in this folder

| File | Purpose |
|------|--------|
| `AndroidManifest.snippet.xml` | Permission + `<receiver>` to paste into your app’s `AndroidManifest.xml`. |
| `SmsReceiver.kt` | BroadcastReceiver that parses PDUs and extracts the code. |
| `README.md` | This file. |
