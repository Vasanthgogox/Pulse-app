import { Dimensions, Platform, ScrollView, View, type RefObject } from 'react-native';

const DEFAULT_HEADER_OFFSET = 76;
const DEFAULT_BOTTOM_PAD = 20;
const IOS_FORM_ACCESSORY_PAD = 52;
const SCROLL_RETRY_MS = [100, 150, 320, 480] as const;

/**
 * Each call to scrollFocusedFieldIntoView schedules up to 4 delayed retries
 * (see SCROLL_RETRY_MS). Tapping a second field before the first field's
 * retries finish left those retries pending — they fired later, measured
 * whatever field's wrapper View now sat at the old target position (layout
 * can shift between fields, e.g. an async hint line appearing/collapsing
 * above them), and scrolled/focused there instead. A module-level generation
 * counter invalidates any in-flight retries as soon as a new field is
 * focused, so only the most recently focused field's retries can ever run.
 */
let scrollRequestGeneration = 0;

type ScrollFieldOptions = {
  keyboardHeight?: number;
  headerOffset?: number;
  extraBottomPad?: number;
  animated?: boolean;
};

function readCssKeyboardHeight(): number {
  if (typeof document === 'undefined') return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--keyboard-height');
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      if (node.scrollHeight > node.clientHeight + 1) return node;
    }
    node = node.parentElement;
  }
  return null;
}

/** Returns true if the field was already within the visible area (no scroll applied). */
function scrollWebFieldIntoView(
  field: View,
  keyboardHeight: number,
  headerOffset: number,
  extraBottomPad: number,
  animated: boolean,
): boolean {
  const el = field as unknown as HTMLElement;
  if (!el?.getBoundingClientRect) return true;

  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  // Always prefer the live CSS var / visualViewport read over the keyboardHeight
  // param: the param is a React-render-time snapshot passed in once per focus,
  // but this function is called again by each of the SCROLL_RETRY_MS retries up
  // to 480ms later — by then the snapshot can be stale relative to the actual
  // keyboard/viewport geometry (useKeyboardVisible's sync() keeps the CSS var
  // fresh on every visualViewport event, so it's the more reliable source here).
  const measuredKb = Math.max(
    keyboardHeight,
    readCssKeyboardHeight(),
    readVisualViewportKeyboardInset(),
  );

  const rect = el.getBoundingClientRect();
  const viewportTop = vv?.offsetTop ?? 0;
  const viewportHeight = vv?.height ?? (typeof window !== 'undefined' ? window.innerHeight : 0);
  const visibleBottom =
    viewportTop + viewportHeight - measuredKb - IOS_FORM_ACCESSORY_PAD - extraBottomPad;
  const visibleTop = viewportTop + headerOffset;

  const scrollParent = findScrollParent(el);
  if (!scrollParent) {
    el.scrollIntoView?.({ block: 'center', behavior: animated ? 'smooth' : 'auto' });
    return true;
  }

  // Already visible — this happens on the retry passes below once an earlier
  // pass already corrected the position. Skipping avoids re-nudging the scroll
  // position on every retry as the iOS Safari keyboard/viewport settles, which
  // read as the field "scrolling on its own" after the user had already stopped.
  if (rect.bottom <= visibleBottom && rect.top >= visibleTop) return true;

  // Compute an absolute target from the field's current position rather than
  // adding a delta on top of whatever the last retry already applied — deltas
  // compound across the retries below if the viewport geometry shifts between
  // them (exactly what happens while the keyboard is animating open).
  if (rect.bottom > visibleBottom) {
    const target = scrollParent.scrollTop + (rect.bottom - visibleBottom) + 12;
    scrollParent.scrollTo({ top: target, behavior: animated ? 'smooth' : 'auto' });
  } else if (rect.top < visibleTop) {
    const target = scrollParent.scrollTop + (rect.top - visibleTop) - 8;
    scrollParent.scrollTo({ top: Math.max(0, target), behavior: animated ? 'smooth' : 'auto' });
  }
  return false;
}

function readVisualViewportKeyboardInset(): number {
  if (typeof window === 'undefined') return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, Math.round(window.innerHeight - vv.height - (vv.offsetTop ?? 0)));
}

function scrollNativeFieldIntoView(
  scroll: ScrollView,
  field: View,
  headerOffset: number,
  keyboardHeight: number,
  extraBottomPad: number,
  animated: boolean,
): void {
  const scrollNative = scroll as ScrollView & { getInnerViewNode?: () => number };
  const parent = scrollNative.getInnerViewNode?.();
  if (parent == null) return;

  field.measureLayout(
    parent,
    (_x, y, _w, height) => {
      const fieldBottom = y + height;
      const windowHeight = Dimensions.get('window').height;
      const visibleHeight = Math.max(
        120,
        windowHeight - keyboardHeight - headerOffset - extraBottomPad,
      );
      const targetByBottom = fieldBottom - visibleHeight + 20;
      const targetByTop = y - headerOffset;
      scroll.scrollTo({ y: Math.max(0, Math.max(targetByTop, targetByBottom)), animated });
    },
    () => {},
  );
}

/**
 * Scrolls a form field into the visible area above the keyboard.
 * Works on native (measureLayout) and mobile web (visualViewport + scroll parent).
 */
export function scrollFocusedFieldIntoView(
  scrollRef: RefObject<ScrollView | null>,
  fieldRef: RefObject<View | null>,
  options: ScrollFieldOptions = {},
): void {
  const scroll = scrollRef.current;
  const field = fieldRef.current;
  if (!scroll || !field) return;

  const animated = options.animated ?? true;
  const headerOffset = options.headerOffset ?? DEFAULT_HEADER_OFFSET;
  const extraBottomPad = options.extraBottomPad ?? DEFAULT_BOTTOM_PAD;
  const keyboardHeight = options.keyboardHeight ?? 0;

  // Invalidates any retries still pending from a previously focused field —
  // see the comment on scrollRequestGeneration above.
  const generation = ++scrollRequestGeneration;

  // The retries exist because the iOS Safari keyboard/viewport geometry keeps
  // changing for a few hundred ms after focus (animation, autofill bar). Once
  // a pass finds the field already visible, later retries have nothing to
  // correct — running them anyway re-measures against a settled viewport and
  // can nudge the scroll position again, which reads as the field "scrolling
  // on its own" after the user stopped interacting.
  let settled = false;
  const run = () => {
    if (settled || generation !== scrollRequestGeneration) return;
    if (Platform.OS === 'web') {
      settled = scrollWebFieldIntoView(field, keyboardHeight, headerOffset, extraBottomPad, animated);
      return;
    }
    scrollNativeFieldIntoView(
      scroll,
      field,
      headerOffset,
      keyboardHeight,
      extraBottomPad,
      animated,
    );
  };

  run();
  for (const delay of SCROLL_RETRY_MS) {
    setTimeout(run, delay);
  }
}
