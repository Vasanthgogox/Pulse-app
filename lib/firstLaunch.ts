/**
 * First-launch flag — used to clear any lingering auth data after app reinstall.
 * Keychain (iOS) can persist after uninstall; on first launch we clear local auth
 * so we don't restore a stale session. See docs/AUTH_LIFECYCLE.md.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@q-mobile/first-launch-done';

export async function isFirstLaunchDone(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(KEY);
    return value === 'true';
  } catch {
    return false;
  }
}

export async function setFirstLaunchDone(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, 'true');
  } catch {
    // Ignore
  }
}
