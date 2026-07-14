import type { AnimationObject } from 'lottie-react-native';

/** Driver activation — step hero animations (green workforce flow). */
export const DRIVER_SIGNUP_LOTTIE = {
  phone: require('@/assets/Animated folder/phone call check.json') as AnimationObject,
  verify: require('@/assets/Animated folder/security.json') as AnimationObject,
  account: require('@/assets/Animated folder/user-info.json') as AnimationObject,
  license: require('@/assets/Animated folder/law approved.json') as AnimationObject,
  success: require('@/assets/Animated folder/delivery completed.json') as AnimationObject,
} as const;
