/**
 * App entry — keep bootstrap order aligned with expo-router/entry-classic.
 *
 * 1. Worklets runtime kind (before any worklets package evaluates)
 * 2. @expo/metro-runtime (Fast Refresh + native bridge)
 * 3. expo-router root via renderRootComponent (gesture-handler loads from app/_layout.tsx)
 *
 * Do NOT require react-native-gesture-handler here — it calls
 * TurboModuleRegistry.getEnforcing before renderRootComponent and triggers:
 *   [runtime not ready]: RNGestureHandlerModule could not be found
 */
require('./polyfills/runtimeKind');
require('@expo/metro-runtime');

const { App } = require('expo-router/build/qualified-entry');
const { renderRootComponent } = require('expo-router/build/renderRootComponent');
renderRootComponent(App);
