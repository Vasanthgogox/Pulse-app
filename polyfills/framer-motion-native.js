/**
 * Native (iOS / Android) shim for `framer-motion`.
 *
 * `moti` declares `framer-motion` as a regular dependency and runtime-imports
 * three symbols from it:
 *   - `AnimatePresence`  (exported from `moti/src/core/index.ts`)
 *   - `usePresence`      (used by `moti/src/core/motify.tsx`)
 *   - `PresenceContext`  (used by `moti/src/core/motify.tsx`)
 *
 * On native, moti's exit animations are handled by Reanimated's `exiting`
 * prop (not framer-motion). The framer-motion CJS bundle is DOM-only — it
 * pulls in heavy `VisualElementDragControls` / `motion-utils` code that
 * cannot run on Hermes/JSC and surfaces at runtime as:
 *
 *   ERROR  [TypeError: Cannot set property 'importedAll' of undefined]
 *   Call Stack:
 *     VisualElementDragControls.prototype.resolveConstraints
 *       (node_modules/framer-motion/dist/cjs/index.js:4056)
 *
 * It also makes Metro's cached module IDs go stale very easily because the
 * framer-motion bundle is huge and gets sliced into many chunks. When IDs
 * drift, the lazy-loaded finance sub-tab chunks fail with:
 *
 *   ERROR  [Error: Requiring unknown module "5072"...]
 *
 * Aliasing `framer-motion` → this shim on native is safe because:
 *   1. AnimatePresence is a passthrough wrapper — children render
 *      immediately; exit animation is delegated to Reanimated's
 *      `exiting` prop on the leaving component.
 *   2. usePresence always reports "present" — exit animations are
 *      orchestrated by Reanimated, not by framer-motion's presence
 *      tracking.
 *   3. PresenceContext stays a real React context so any `useContext`
 *      calls in moti return `null` (the documented default).
 *
 * Metro's `resolveRequest` in `metro.config.js` redirects
 * `'framer-motion'` (and any subpath) to this file when `platform` is
 * `ios` or `android`. Web keeps the real framer-motion package.
 */
"use strict";

const React = require("react");

const PresenceContext = React.createContext(null);

function usePresence() {
  return [true, function noopSafeToRemove() {}];
}

function AnimatePresence(props) {
  return props && props.children != null ? props.children : null;
}

module.exports = {
  __esModule: true,
  AnimatePresence: AnimatePresence,
  PresenceContext: PresenceContext,
  usePresence: usePresence,
  default: {
    AnimatePresence: AnimatePresence,
    PresenceContext: PresenceContext,
    usePresence: usePresence,
  },
};
