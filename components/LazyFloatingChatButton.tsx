/**
 * Lazy wrapper for FloatingChatButton.
 *
 * The button is desktop-web-only — but a static import in `app/_layout.tsx`
 * pulled the chat graph (FloatingChatButton + trip + integrated chat hooks,
 * preview popover, store) into the **startup chunk** for every platform.
 *
 * This wrapper keeps the bundle split: nothing in the chat graph is touched
 * until first idle on the device that needs it. Mobile web / native never
 * fetches the chunk because `_layout.tsx` only renders this component when
 * `isDesktopWeb` is true.
 *
 * No module-level cache: HMR can hot-replace `FloatingChatButton` without us
 * pinning a stale reference. Each mount triggers a fresh dynamic `import()`,
 * which Metro caches at the bundle level.
 */
import { useEffect, useState, type ComponentType } from 'react';
import { scheduleIdleWork } from '@/lib/scheduleIdleWork';

type Comp = ComponentType<Record<string, never>>;

export function LazyFloatingChatButton() {
  const [Comp, setComp] = useState<Comp | null>(null);

  useEffect(() => {
    let cancelled = false;
    scheduleIdleWork(() => {
      if (cancelled) return;
      void import('@/components/FloatingChatButton').then((m) => {
        if (cancelled) return;
        setComp(() => m.FloatingChatButton as Comp);
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return Comp ? <Comp /> : null;
}
