import { Dimensions, Platform, ScrollView, View, type RefObject } from 'react-native';

import { WEB_KEYBOARD_INSET_THRESHOLD_PX } from '@/lib/webViewportHeight';

const DEFAULT_HEADER_OFFSET = 76;
const DEFAULT_BOTTOM_PAD = 20;
const IOS_FORM_ACCESSORY_PAD = 52;
const SCROLL_RETRY_MS = [100, 150, 320, 480] as const;

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

function scrollWebFieldIntoView(
  field: View,
  keyboardHeight: number,
  headerOffset: number,
  extraBottomPad: number,
  animated: boolean,
): void {
  const el = field as unknown as HTMLElement;
  if (!el?.getBoundingClientRect) return;

  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  const measuredKb =
    keyboardHeight >= WEB_KEYBOARD_INSET_THRESHOLD_PX
      ? keyboardHeight
      : Math.max(readCssKeyboardHeight(), readVisualViewportKeyboardInset());

  const rect = el.getBoundingClientRect();
  const viewportTop = vv?.offsetTop ?? 0;
  const viewportHeight = vv?.height ?? (typeof window !== 'undefined' ? window.innerHeight : 0);
  const visibleBottom =
    viewportTop + viewportHeight - measuredKb - IOS_FORM_ACCESSORY_PAD - extraBottomPad;
  const visibleTop = viewportTop + headerOffset;

  const scrollParent = findScrollParent(el);
  if (!scrollParent) {
    el.scrollIntoView?.({ block: 'center', behavior: animated ? 'smooth' : 'auto' });
    return;
  }

  if (rect.bottom > visibleBottom) {
    scrollParent.scrollTop += rect.bottom - visibleBottom + 12;
  } else if (rect.top < visibleTop) {
    scrollParent.scrollTop += rect.top - visibleTop - 8;
  }
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

  const run = () => {
    if (Platform.OS === 'web') {
      scrollWebFieldIntoView(field, keyboardHeight, headerOffset, extraBottomPad, animated);
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
