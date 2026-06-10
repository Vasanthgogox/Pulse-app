# Testing SMS OTP parsing (Method 2)

After integrating the receiver and building with `npx expo run:android`, use these steps to confirm it works.

## Log tag (must match)

All logs use the tag **`SmsReceiver`**. Example in code: `Log.d("SmsReceiver", "SMS received")`.

- Filter by tag: `adb logcat -s SmsReceiver:I`
- **zsh users:** use quotes so `*` is not expanded: `adb logcat '*:I' | grep -i SmsReceiver`
- If you see system SMS logs but never "SmsReceiver", show only your app’s logs by PID (open the app first, then in another terminal):
  ```bash
  adb shell pidof com.pulse.app
  ```
  then (replace 12345 with the number printed):
  ```bash
  adb logcat --pid=12345
  ```
  You should see `SmsInboxObserver registered` when the app starts and `onChange` / `InboxObserver: new SMS` when an SMS arrives.
- Other options: `adb logcat | grep -i SmsReceiver` or `adb logcat '*:I' | grep -i SmsReceiver`

## No logs at all — what you might be missing

1. **Open the app first.** The inbox observer is registered in `MainApplication.onCreate()`, which runs only when the app process starts. So: **install → open the app at least once → then run logcat → then send SMS.** If you never open the app, the observer is never registered and you will see no logs.

2. **Order of steps.** Do this order:
   - `npx expo run:android` (install)
   - **Open the app on the device** (so "SmsInboxObserver registered" is logged)
   - On your computer: `adb logcat -c && adb logcat | grep SmsReceiver`
   - Send an SMS to the device (with a 4–8 digit code in the text)

3. **READ_SMS granted.** Settings → Apps → [your app] → Permissions → **SMS** / **Read SMS** must be ON. Without it you may see `READ_SMS permission not granted` in logcat (or nothing if the observer isn’t notified).

4. **Confirm observer is registered.** After opening the app, in logcat you should see: `SmsReceiver: SmsInboxObserver registered for content://sms`. If you don’t see that, the app you’re running may be an old build or a different app (e.g. Expo Go).

5. **Try unfiltered logcat.** Run `adb logcat` (no grep). Send an SMS. Search the output for `SmsReceiver` or `SMS` to confirm logs aren’t being dropped by the filter.

## Why is logcat empty / "not running"?

- **`adb logcat -s SmsReceiver:D`** is running; it just shows nothing until a matching log line appears.
- **On many devices the default SMS app (e.g. Google Messages) gets the SMS first and consumes the broadcast**, so our `SmsReceiver` never runs. We added a **fallback: SmsInboxObserver** that watches the system SMS inbox. When a new SMS is saved, we read it and parse for OTP. That works even when we’re not the default app.

**Use the inbox fallback:**

1. **Grant READ_SMS:** Settings → Apps → [your app] → Permissions → turn **SMS** (and if listed) **Read SMS** **ON**.
2. **Rebuild and open the app once:** `npx expo run:android`, then open the app so the observer is registered.
3. **Send an SMS** to the device (with a 4–8 digit code in the text).
4. **Logcat:** `adb logcat -s SmsReceiver:D` or `adb logcat | grep SmsReceiver` — look for **`InboxObserver: new SMS from ...`** and **`SMS OTP parsed (inbox): code=...`**.

If you see those lines, parsing works via the inbox observer. You will not see `onReceive called` if the broadcast is consumed by the default app.

## 1. Rebuild and install

```bash
npx expo run:android
```

The app is now built with `RECEIVE_SMS` and `SmsReceiver` in the manifest. Use **this dev client** for SMS parsing (not Expo Go). When you run `npx expo start`, Metro should say "Using development build" and open `exp+pulse://expo-development-client/...` on the device — that is the correct build.

## 2. Grant SMS permission

On the device/emulator:

- **Settings → Apps → Pulse (or your app name) → Permissions**
- Turn **SMS** (or “Receive SMS”) **ON**.

Or from a terminal (device connected via USB):

```bash
adb shell pm grant com.pulse.app android.permission.RECEIVE_SMS
```

## 3. Send a test SMS

From another phone (or an online SMS test service), send an SMS **to the phone where the app is installed**. The message must contain a **4–8 digit number**, for example:

- `Your code is 123456`
- `OTP: 9876`
- `Use 554433 to sign in`

The receiver only logs when it finds such a code in the body.

## 4. Check Logcat

With the device connected and the app installed, **clear logs then watch** (recommended):

```bash
adb logcat -c
adb logcat -s SmsReceiver:D
```

If the tag filter shows nothing, try:

```bash
adb logcat | grep SmsReceiver
# or
adb logcat | grep -i sms
```

Or in Android Studio: **View → Tool Windows → Logcat**, then filter by tag `SmsReceiver`.

Send the test SMS. You should see a line like:

```
D/SmsReceiver: SMS OTP parsed: code=123456 sender=+1234567890 body=Your code is 123456
```

If that appears, the receiver is running and parsing correctly.

## 5. Optional: default SMS app

On some devices, receiving SMS in the background may behave better if the app is not the default SMS app but has **SMS** permission. If you never see the log:

- Ensure **SMS** permission is granted (step 2).
- Try sending the SMS with the app in the foreground, then in the background.
- Check that no other app is aborting the broadcast (e.g. default SMS app with high priority).

## Quick checklist

- RECEIVE_SMS and READ_SMS in manifest and **granted** (Settings → App → Permissions)
- Receiver in manifest: `<receiver android:name=".SmsReceiver" android:exported="true">` with `SMS_RECEIVED` intent-filter
- `createFromPdu(bytes, format)` used in code (Android 10+ compatible)
- **Native build:** `npx expo run:android` (not Expo Go; receiver is only in the dev client build)
- **Real device** (SMS often unreliable on emulator)
- **Android 13+:** POST_NOTIFICATIONS is in the manifest; grant Notifications if required on your device

## Summary

| Step | Action |
|------|--------|
| 1 | `npx expo run:android` (receiver is already in this project) |
| 2 | Grant **SMS** permission to the app (Settings or `adb shell pm grant`) |
| 3 | Send an SMS to the device with a 4–8 digit code in the text |
| 4 | `adb logcat -c` then `adb logcat -s SmsReceiver:D` or `adb logcat | grep SmsReceiver`; confirm `SMS OTP parsed: code=...` or `InboxObserver: new SMS from ...` |

## Alternative: SMS Retriever API

For production OTP autofill without READ_SMS, consider the [Google SMS Retriever API](https://developers.google.com/android/reference/com/google/android/gms/auth/api/phone/SmsRetriever): no SMS permission, more secure, used by many apps. This project uses direct SMS parsing (Method 2) for full control and compatibility with any OTP format.
