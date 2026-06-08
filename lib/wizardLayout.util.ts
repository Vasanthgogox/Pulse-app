import { Layout } from "@/constants/Layout";

/**
 * Full-page modal wizards (Create Trip, Create Load, Deploy load, Reassign stepped)
 * use the same stepped mobile layout on native and web — centered column, one step at a time.
 */
export const WIZARD_FULL_PAGE_STEPPED = true;

/** Stepped wizard below this width when not forcing full-page stepped mode. */
export function isNarrowSteppedViewport(width: number): boolean {
  return width < Layout.wizardSteppedMaxWidth;
}

/** Whether a full-page wizard route should use stepped layout (mobile app parity on web). */
export function useSteppedWizardLayout(width: number): boolean {
  return WIZARD_FULL_PAGE_STEPPED || isNarrowSteppedViewport(width);
}

/** Centered wizard body column (matches FullPageWizardShell). */
export function wizardBodyMaxWidth(width: number): number {
  return Math.min(width, Layout.wizardBodyMaxWidth);
}
