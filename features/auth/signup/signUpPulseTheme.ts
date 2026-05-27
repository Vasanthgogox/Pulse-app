import Theme from '@/constants/Theme';

export type SignUpTheme = {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  primaryTint: string;
  canvas: string;
  bg: string;
  text: string;
  muted: string;
  placeholder: string;
  border: string;
  borderFocus: string;
  surface: string;
  keypadTray: string;
  disabledBg: string;
  disabledText: string;
  deviceBorder: string;
};

/** Business / workspace signup — Pulse indigo-purple. */
export const PULSE_SIGNUP: SignUpTheme = {
  primary: Theme.actionAccent,
  primaryDark: Theme.actionAccentBorder,
  primaryLight: Theme.primaryLight,
  primaryTint: '#EEF2FF',
  canvas: '#f3f4f6',
  bg: '#ffffff',
  text: '#111827',
  muted: '#6b7280',
  placeholder: '#d1d5db',
  border: '#e5e7eb',
  borderFocus: Theme.actionAccent,
  surface: Theme.analyticsCanvas,
  keypadTray: Theme.analyticsCanvas,
  disabledBg: '#f3f4f6',
  disabledText: '#9ca3af',
  deviceBorder: '#111111',
};

export const PULSE_SIGNUP_RADIUS = {
  input: 16,
  button: 16,
  pill: 14,
  card: 20,
  device: 48,
  keypadTray: 32,
} as const;
