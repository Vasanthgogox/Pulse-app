import Layout from '@/constants/Layout';
import { Platform } from 'react-native';

/** Desktop hub UI scale — always 1 (CSS zoom removed; see `lib/htmlShell.ts`). */
export const WEB_DESKTOP_UI_SCALE = Layout.webDesktopUiScale;

export function isWebDesktopUiScaled(width: number): boolean {
  return Platform.OS === 'web' && width >= Layout.webDesktopMinWidth;
}

/** @deprecated CSS zoom removed — returns layout px unchanged. */
export function webDesktopVisualPx(layoutPx: number): number {
  return layoutPx;
}

export function useWebDesktopUiScale(): number {
  return 1;
}
