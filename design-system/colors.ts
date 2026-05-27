/**
 * Semantic operational colors — map to Theme during migration.
 * Use these for new UI; avoid raw hex in components.
 */
import Theme from '@/constants/Theme';

export const colors = {
  canvas: Theme.screenBackground,
  surface: Theme.surface,
  surfaceRaised: Theme.cardWhite,
  borderSubtle: Theme.surfaceBorder,
  borderDefault: Theme.borderMedium,

  textPrimary: Theme.textPrimaryDark,
  textSecondary: Theme.textSecondary,
  textMuted: Theme.textMuted,
  textOnBrand: Theme.textOnPrimary,

  brand: Theme.primary,
  brandMuted: Theme.primaryLight,

  revenue: Theme.success,
  cost: Theme.destructive,
  pending: Theme.warning,
  info: Theme.primary,

  operational: '#0f172a',
  operationalMuted: '#64748b',
} as const;

export default colors;
