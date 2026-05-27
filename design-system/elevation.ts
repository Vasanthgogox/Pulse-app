import { Platform, type ViewStyle } from 'react-native';

import Theme from '@/constants/Theme';

type ElevationLevel = 0 | 1 | 2 | 3;

/** Prefer surface contrast over borders; elevation is subtle. */
export function elevation(level: ElevationLevel): ViewStyle {
  if (level === 0) {
    return {
      backgroundColor: Theme.screenBackground,
    };
  }

  const configs: Record<Exclude<ElevationLevel, 0>, ViewStyle> = {
    1: {
      backgroundColor: Theme.cardWhite,
      ...Platform.select({
        ios: {
          shadowColor: '#0f172a',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.04,
          shadowRadius: 3,
        },
        android: { elevation: 1 },
        default: {},
      }),
    },
    2: {
      backgroundColor: Theme.cardWhite,
      ...Platform.select({
        ios: {
          shadowColor: '#0f172a',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
        },
        android: { elevation: 3 },
        default: {},
      }),
    },
    3: {
      backgroundColor: Theme.cardWhite,
      ...Platform.select({
        ios: {
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.1,
          shadowRadius: 24,
        },
        android: { elevation: 8 },
        default: {},
      }),
    },
  };

  return configs[level];
}

export default elevation;
