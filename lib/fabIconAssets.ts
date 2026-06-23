/**
 * Colorful brand-style glyphs for floating action buttons (from `assets/icon and logos`).
 */
import CloudOneIcon from "@/assets/icon and logos/cloud-one.svg";
import DuolingoIcon from "@/assets/icon and logos/duolingo.svg";
import GrabIcon from "@/assets/icon and logos/grab.svg";
import HotAirBalloonIcon from "@/assets/icon and logos/hot-air-balloon.svg";
import OfficeIcon from "@/assets/icon and logos/office.svg";
import ProyectoCasaIcon from "@/assets/icon and logos/proyecto-casa.svg";
import QuickbooksIcon from "@/assets/icon and logos/quickbooks.svg";
import StripeIcon from "@/assets/icon and logos/stripe.svg";
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

/** Maps semantic FAB icons to full-color SVG assets. */
export const FAB_ICON_ASSETS: Partial<Record<FABIconName, FabAssetGlyph>> = {
  building: { Asset: OfficeIcon, glyphScale: 0.78 },
  warehouse: { Asset: ProyectoCasaIcon, glyphScale: 0.76 },
  truck: { Asset: GrabIcon, glyphScale: 0.72 },
  user: { Asset: DuolingoIcon, glyphScale: 0.74 },
  "user-plus": { Asset: DuolingoIcon, glyphScale: 0.74 },
  "receipt-text": { Asset: QuickbooksIcon, glyphScale: 0.76 },
  "credit-card": { Asset: StripeIcon, glyphScale: 0.7 },
  package: { Asset: CloudOneIcon, glyphScale: 0.76 },
  road: { Asset: HotAirBalloonIcon, glyphScale: 0.76 },
};
