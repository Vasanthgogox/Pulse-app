/**
 * Illustration glyphs for floating action buttons — aligned with finance promo heroes.
 */
import Illustration3 from "@/assets/illustrations/3.svg";
import Illustration6 from "@/assets/illustrations/6.svg";
import Illustration14 from "@/assets/illustrations/14.svg";
import Illustration20 from "@/assets/illustrations/20.svg";
import Illustration28 from "@/assets/illustrations/28.svg";
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

/** Maps semantic FAB icons to full-color illustration assets. */
export const FAB_ICON_ASSETS: Partial<Record<FABIconName, FabAssetGlyph>> = {
  building: { Asset: Illustration3, glyphScale: 0.92 },
  warehouse: { Asset: Illustration28, glyphScale: 0.9 },
  truck: { Asset: Illustration14, glyphScale: 0.9 },
  user: { Asset: Illustration20, glyphScale: 0.9 },
  "user-plus": { Asset: Illustration20, glyphScale: 0.9 },
  "receipt-text": { Asset: Illustration6, glyphScale: 0.88 },
  "credit-card": { Asset: Illustration6, glyphScale: 0.88 },
};
