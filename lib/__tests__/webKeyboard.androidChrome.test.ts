import {
  WEB_TRAILING_FOCUS_GUARD,
  isAndroidChromeWeb,
  preventWebFocusSteal,
  shouldAvoidWebKeyboardFormReflow,
} from '@/lib/webKeyboard';

const originalUa = navigator.userAgent;

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    get: () => ua,
  });
}

afterEach(() => {
  setUserAgent(originalUa);
});

describe('shouldAvoidWebKeyboardFormReflow', () => {
  it('is true on Android Chrome (Join-your-team keyboard dismiss root cause)', () => {
    setUserAgent(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36',
    );
    expect(isAndroidChromeWeb()).toBe(true);
    expect(shouldAvoidWebKeyboardFormReflow()).toBe(true);
  });

  it('is true on Android Edge (Chromium, same overlay-keyboard blur)', () => {
    setUserAgent(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 EdgA/126.0.0.0',
    );
    expect(shouldAvoidWebKeyboardFormReflow()).toBe(true);
  });

  it('is false on iOS Chrome (CriOS) — WebKit, not Chromium overlay', () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.108 Mobile/15E148 Safari/604.1',
    );
    expect(isAndroidChromeWeb()).toBe(false);
    expect(shouldAvoidWebKeyboardFormReflow()).toBe(false);
  });

  it('is false on desktop Chrome', () => {
    setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    );
    expect(isAndroidChromeWeb()).toBe(false);
    expect(shouldAvoidWebKeyboardFormReflow()).toBe(false);
  });

  it('is false on Android Firefox (not Chromium overlay)', () => {
    setUserAgent(
      'Mozilla/5.0 (Android 14; Mobile; rv:126.0) Gecko/126.0 Firefox/126.0',
    );
    expect(shouldAvoidWebKeyboardFormReflow()).toBe(false);
  });
});

describe('preventWebFocusSteal', () => {
  it('calls preventDefault so the password-eye click does not blur the input', () => {
    const preventDefault = jest.fn();
    preventWebFocusSteal({ preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('guards both mouse and pointer (mobile Chrome tap is pointerdown, not mousedown-first)', () => {
    expect(WEB_TRAILING_FOCUS_GUARD.onMouseDown).toBe(preventWebFocusSteal);
    expect(WEB_TRAILING_FOCUS_GUARD.onPointerDown).toBe(preventWebFocusSteal);
  });
});
