# Network request failed (sign-in / Supabase)

If you see **"Network request failed"** when signing in or loading the app, env is usually fine; the **device or emulator cannot reach the internet** (or Supabase).

## Best fix (in order)

### 1. Use a physical device (recommended)

Run the app on a **real phone** on the same Wi‑Fi as your Mac (no VPN):

```bash
npx expo start
```

- **Android:** Open Expo Go on the phone, scan the QR code.
- **iOS:** Open Camera, scan the QR code, open in Expo Go.

If sign-in works on the device, the problem is the emulator's network.

---

### 2. Use iOS Simulator (if you have Xcode)

```bash
npx expo start
# Press `i` to open iOS Simulator
```

iOS Simulator usually has working internet.

---

### 3. Fix Android Emulator internet

The emulator often has **no working internet**. Try:

1. **Cold boot**
   - Android Studio → Device Manager (AVD Manager) → ⋮ on your virtual device → **Cold Boot Now**.

2. **Check connectivity from the emulator**
   ```bash
   adb shell ping -c 2 8.8.8.8
   ```
   If this fails, the emulator has no network.

3. **New AVD with a recent image**
   - Device Manager → Create Device → pick a recent system image (e.g. API 34) → Finish. Run the new emulator and try again.

4. **Emulator DNS**
   - In the emulator: Settings → Network & internet → Internet → your network → set DNS to `8.8.8.8` if needed.

---

### 4. Check your environment

- **.env** in the project root must have:
  - `EXPO_PUBLIC_SUPABASE_URL=https://...supabase.co`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...`
- After changing .env: **restart** with `npx expo start --clear`.
- If you use **.env.local**, it overrides .env; remove or fix it if you see "Network request failed".

---

### 5. Confirm the app's Supabase URL (dev)

In Metro logs you should see:

```text
[pulse] Supabase URL host: mhedvagyuplkbrfaoctl.supabase.co
```

If you see that, config is correct and the issue is device/emulator network only.

---

## Home WiFi vs mobile data

If the app works on **mobile data / personal hotspot** but fails on **home or office WiFi** with "Network request failed" or "Connection error", the cause is usually the local network, not the app.

### Root causes

1. **DNS** – The router may not resolve `*.supabase.co` correctly or may block it.
2. **Firewall / content filtering** – Parental controls, "block suspicious sites", or security features can block cloud APIs.
3. **SSL inspection** – Some gateways do HTTPS inspection and break certificate validation; the app will see a generic network failure.
4. **IPv6** – If the network prefers IPv6 and the path to Supabase is broken, requests can fail (mobile often uses IPv4).

### What you can do on the home network

1. **Try different DNS**
   - On the **router**: set DNS to `8.8.8.8` (Google) or `1.1.1.1` (Cloudflare).
   - On the **device**: iOS: Settings → Wi‑Fi → (i) next to your network → Configure DNS → Manual → add `8.8.8.8` or `1.1.1.1`.

2. **Temporarily disable filtering**
   - Turn off parental controls, "block unknown sites", or similar features on the router and test again.

3. **Confirm with another device**
   - Open a browser on the same WiFi and go to your Supabase project URL (e.g. `https://your-project.supabase.co` from `.env`). If that fails, the network is blocking or misrouting Supabase.

4. **Use mobile data for the app**
   - If you can't change the router, using cellular/mobile data or a hotspot for the app is a reliable workaround.

### Reference

- Supabase URL used by the app comes from `.env`: `EXPO_PUBLIC_SUPABASE_URL`.
