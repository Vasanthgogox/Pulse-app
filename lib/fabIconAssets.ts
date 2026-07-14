/**
 * Illustration glyphs for floating action buttons — aligned with finance promo heroes.
 */
import type { ComponentType } from "react";
import type { SvgProps } from "react-native-svg";

export type FABIconName =
  | "plus"
  | "receipt-text"
  | "credit-card"
  | "user"
  | "user-plus"
  | "building"
  | "warehouse"
  | "truck"
  | "road"
  | "package";

export type FabAssetGlyph = {
  Asset: ComponentType<SvgProps>;
  /** Relative to the inner white chip (default 0.72). */
  glyphScale?: number;
};

/** Compact add labels for party + cash FABs (replaces illustration heroes). */
export const PARTY_FAB_ADD_LABELS: Partial<Record<FABIconName, string>> = {
  building: "Add customer",
  warehouse: "Add supplier",
  truck: "Add vehicle",
  user: "Add driver",
  "user-plus": "Add driver",
  "receipt-text": "Add cash",
};

/** Maps semantic FAB icons to full-color illustration assets. */
export const FAB_ICON_ASSETS: Partial<Record<FABIconName, FabAssetGlyph>> = {};
