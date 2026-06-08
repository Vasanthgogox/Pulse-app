import Theme from "@/constants/Theme";
import type { BadgeVariant } from "@/lib/productRegistry";

/** Workspace catalogue — purple / black / gray only (no multi-color badges). */
export const WORKSPACE_ACCENT = Theme.primary;
export const WORKSPACE_ACCENT_SOFT = "rgba(79,70,229,0.08)";
export const WORKSPACE_ACCENT_BORDER = "rgba(79,70,229,0.18)";

export const WORKSPACE_ELEGANT_BADGE: Record<
  BadgeVariant,
  { bg: string; text: string; border: string }
> = {
  green: {
    bg: WORKSPACE_ACCENT_SOFT,
    text: WORKSPACE_ACCENT,
    border: WORKSPACE_ACCENT_BORDER,
  },
  indigo: {
    bg: WORKSPACE_ACCENT_SOFT,
    text: WORKSPACE_ACCENT,
    border: WORKSPACE_ACCENT_BORDER,
  },
  amber: {
    bg: Theme.surface,
    text: Theme.textSecondary,
    border: Theme.borderLight,
  },
  rose: {
    bg: Theme.surface,
    text: Theme.textPrimaryDark,
    border: Theme.borderMedium,
  },
  gray: {
    bg: Theme.surface,
    text: Theme.textMuted,
    border: Theme.borderLight,
  },
};
