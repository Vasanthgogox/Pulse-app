import { useWebLayoutWidth } from '@/lib/useWebLayoutWidth';
import { Platform } from 'react-native';

/** Native phones and narrow web viewports use stacked mobile profile hub chrome. */
export const PROFILE_HUB_COMPACT_MAX_WIDTH = 768;

export function useProfileHubCompact(): boolean {
  const width = useWebLayoutWidth();
  if (Platform.OS !== 'web') return true;
  return width < PROFILE_HUB_COMPACT_MAX_WIDTH;
}
