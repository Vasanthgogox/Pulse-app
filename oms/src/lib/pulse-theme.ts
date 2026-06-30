/**
 * Pulse Commerce design tokens — aligned with constants/Theme.ts (business app).
 * Prefer CSS variables in index.css; use this for TS when needed.
 */
export const PulseTheme = {
  heroBlue:         '#2B3171',
  brandBlue:        '#9ACEEB',
  brandBlueFill:    '#CDE9F7',
  brandBlueSoft:    '#E5F4FB',
  brandBlueInk:     '#4D3636',
  canvas:           '#F8F9FB',
  sidebar:          '#F8FAFC',
  border:           '#E2E8F0',
  textPrimary:      '#1E293B',
  textMuted:        '#64748B',
  successBg:        '#E8F5E9',
  successText:      '#15803D',
  successDot:       '#22C55E',
  marginBg:         '#E8F5E9',
  marginText:       '#15803D',
  warningBg:        '#FEF3C7',
  warningText:      '#B45309',
  dangerBg:         '#FEE2E2',
  dangerText:       '#DC2626',
  negativeBg:       '#FEF2F2',
  negativeText:     '#DC2626',
} as const;
