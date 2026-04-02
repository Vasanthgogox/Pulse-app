# Detox E2E (Automated on Simulator)

E2E tests run on the **iOS Simulator**: the simulator opens, the app launches, and you watch the test tap through the UI in real time.

## Prerequisites

- **macOS** with Xcode and iOS Simulator
- **applesimutils** (for Detox):  
  `brew tap wix/brew && brew install applesimutils`
- **Expo prebuild** must have been run so the `ios/` folder exists

## One-time setup

1. **Install dependencies** (already in `package.json`):
   ```bash
   npm install
   ```

2. **Generate native projects** (if not already done):
   ```bash
   npx expo prebuild
   ```
   This creates `ios/q-mobile.xcworkspace` and wires in `expo-detox-config-plugin` (Expo 54–compatible).

3. **Build the app for the simulator** (first time and after native changes):
   ```bash
   npm run test:e2e:build
   ```

## Run E2E tests

```bash
npm run test:e2e
```

To run a single test file:

```bash
npx detox test -c ios.sim.debug e2e/addDriver.e2e.ts
```

The simulator will open, the app will launch, and the test will execute (navigate to Finance > Drivers, open Add Driver, fill form, submit, assert finance screen is visible).

## Scripts

| Script | Description |
|--------|-------------|
| `npm run test:e2e:build` | Build the iOS app for the simulator (Debug). |
| `npm run test:e2e` | Run all Detox E2E tests (ios.sim.debug). |

## Config

- **detox.config.js** – app binary path, build command, device (e.g. iPhone 16 simulator).
- **e2e/jest.config.js** – Jest config for Detox (timeouts, reporter, testEnvironment).

If the app name/scheme or path changes (e.g. after renaming the slug), update `binaryPath` and the `xcodebuild` command in `detox.config.js`.

## testIDs used (Add Driver flow)

- `finance-tab-screen` – root of the Finance tab (assertion after close).
- `add-driver-fab` – FAB on Finance > Drivers that opens the Add Driver modal.
- `driver-phone-input` – phone field in the first step.
- `driver-name-input` – contact name field in the first step.
- `invite-submit-btn` – “Send Invitation” button on the Review step (wizard and popup modal).
