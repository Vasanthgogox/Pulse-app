import { Alert, Platform } from 'react-native';

/**
 * User-visible alert that works on native and web. On web, `Alert.alert` from
 * react-native-web is not reliably shown in all browsers/builds; use the native
 * dialog so validation and errors are always visible.
 */
export function showAppAlert(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    const body = message && message.trim().length > 0 ? `${title}\n\n${message}` : title;
    window.alert(body);
    return;
  }
  if (message != null && message.trim().length > 0) {
    Alert.alert(title, message);
  } else {
    Alert.alert(title);
  }
}
