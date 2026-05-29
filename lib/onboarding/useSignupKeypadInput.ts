import { Platform } from 'react-native';

/** Custom keypad on iOS/Android; OS keyboard + TextInput on web (all widths). */
export function useSignupKeypadInput(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}
