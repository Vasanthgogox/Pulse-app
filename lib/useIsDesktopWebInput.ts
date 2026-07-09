import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * True on web when the viewport is >= 1024px AND the pointer is fine (mouse/trackpad).
 * Keeps mobile browsers in stacked mode even when they report wider CSS widths.
 * Always false on native.
 */
export function useIsDesktopWebInput(): boolean {
  const [viewportWidth, setViewportWidth] = useState<number>(() => {
    if (Platform.OS !== 'web') return 0;
    if (typeof window === 'undefined') return 1280;
    return window.innerWidth || 1280;
  });
  const [hasFinePointer, setHasFinePointer] = useState<boolean>(() => {
    if (Platform.OS !== 'web') return false;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  });

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const updatePointerMode = () => {
      if (typeof window.matchMedia !== 'function') {
        setHasFinePointer(true);
        return;
      }
      setHasFinePointer(window.matchMedia('(hover: hover) and (pointer: fine)').matches);
    };
    const handleResize = () => {
      setViewportWidth(window.innerWidth || 1280);
      updatePointerMode();
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    handleResize();
    updatePointerMode();
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return Platform.OS === 'web' ? viewportWidth >= 1024 && hasFinePointer : false;
}
