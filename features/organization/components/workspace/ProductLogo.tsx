import type { ReactElement, ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";

import Theme from "@/constants/Theme";
import type { ProductId } from "@/lib/productRegistry";

type Brand = {
  primary: string;
  secondary: string;
  light: string;
  highlight: string;
  depth: string;
};

const PRODUCT_BRAND: Record<ProductId, Brand> = {
  pulse_core: {
    primary: "#6366f1",
    secondary: "#4338ca",
    light: "#eef2ff",
    highlight: "#a5b4fc",
    depth: "#312e81",
  },
  pulse_pod_pro: {
    primary: "#10b981",
    secondary: "#047857",
    light: "#ecfdf5",
    highlight: "#6ee7b7",
    depth: "#064e3b",
  },
  pulse_invoice_pro: {
    primary: "#f97316",
    secondary: "#c2410c",
    light: "#fff7ed",
    highlight: "#fdba74",
    depth: "#7c2d12",
  },
  pulse_finance_pro: {
    primary: "#3b82f6",
    secondary: "#1d4ed8",
    light: "#eff6ff",
    highlight: "#93c5fd",
    depth: "#1e3a8a",
  },
  pulse_fleet_pro: {
    primary: "#8b5cf6",
    secondary: "#6d28d9",
    light: "#f5f3ff",
    highlight: "#c4b5fd",
    depth: "#4c1d95",
  },
  pulse_people: {
    primary: "#06b6d4",
    secondary: "#0e7490",
    light: "#ecfeff",
    highlight: "#67e8f9",
    depth: "#164e63",
  },
  pulse_talent: {
    primary: "#ec4899",
    secondary: "#be185d",
    light: "#fdf2f8",
    highlight: "#f9a8d4",
    depth: "#831843",
  },
  pulse_marketplace: {
    primary: "#22c55e",
    secondary: "#15803d",
    light: "#f0fdf4",
    highlight: "#86efac",
    depth: "#14532d",
  },
  pulse_exchange: {
    primary: "#6366f1",
    secondary: "#4338ca",
    light: "#eef2ff",
    highlight: "#a5b4fc",
    depth: "#312e81",
  },
  pulse_compliance: {
    primary: "#0ea5e9",
    secondary: "#0369a1",
    light: "#f0f9ff",
    highlight: "#7dd3fc",
    depth: "#0c4a6e",
  },
  pulse_ai: {
    primary: "#a855f7",
    secondary: "#7e22ce",
    light: "#faf5ff",
    highlight: "#d8b4fe",
    depth: "#581c87",
  },
};

const MUTED_BRAND: Brand = {
  primary: "#a1a1aa",
  secondary: "#71717a",
  light: "#f4f4f5",
  highlight: "#e4e4e7",
  depth: "#52525b",
};

function brandFor(productId: ProductId, muted: boolean): Brand {
  if (muted) return MUTED_BRAND;
  return PRODUCT_BRAND[productId] ?? PRODUCT_BRAND.pulse_core;
}

function gradId(productId: ProductId, key: string): string {
  return `pl-${productId}-${key}`;
}

type TileProps = {
  productId: ProductId;
  b: Brand;
  children: ReactNode;
};

/** Glossy 3D app-tile base — gradient face, depth edge, ground shadow, specular. */
function GlossyTile({ productId, b, children }: TileProps) {
  const bg = gradId(productId, "bg");
  const shine = gradId(productId, "shine");
  const edge = gradId(productId, "edge");

  return (
    <>
      <Defs>
        <LinearGradient id={bg} x1="0.15" y1="0" x2="0.85" y2="1">
          <Stop offset="0" stopColor={b.highlight} />
          <Stop offset="0.38" stopColor={b.primary} />
          <Stop offset="1" stopColor={b.secondary} />
        </LinearGradient>
        <LinearGradient id={shine} x1="0" y1="0" x2="0.5" y2="0.65">
          <Stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <Stop offset="0.55" stopColor="#ffffff" stopOpacity="0.12" />
          <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id={edge} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={b.depth} stopOpacity="0.55" />
          <Stop offset="1" stopColor={b.depth} stopOpacity="0.85" />
        </LinearGradient>
      </Defs>

      <Ellipse cx="24" cy="42.5" rx="13.5" ry="3" fill="#0f172a" opacity={0.14} />

      {/* Depth slab (isometric bottom-right edge) */}
      <Path
        d="M34 12 C37 12 39 14 39 17 V35 C39 37.5 37.5 39 35 39 H13 C10.5 39 9 37.5 9 35 V17 C9 14 11 12 14 12 H34 Z"
        fill={b.depth}
        opacity={0.35}
        transform="translate(1.5, 2.5)"
      />

      <Rect x="9" y="9" width="30" height="30" rx="9.5" fill={`url(#${bg})`} />

      {/* Bottom inner shadow */}
      <Path
        d="M9 28 H39 V35 C39 37.5 37.5 39 35 39 H13 C10.5 39 9 37.5 9 35 V28 Z"
        fill="#000"
        opacity={0.12}
      />

      <Rect x="9" y="9" width="30" height="15" rx="9.5" fill={`url(#${shine})`} />

      {/* Right edge bevel */}
      <Path
        d="M33 9 H35 C37.5 9 39 10.5 39 13 V35 C39 37 38 38.5 36.5 39 H33 V9 Z"
        fill={`url(#${edge})`}
        opacity={0.35}
      />

      <G>{children}</G>
    </>
  );
}

type MarkProps = { b: Brand; productId: ProductId };

function CoreMark({ b }: MarkProps) {
  return (
    <G>
      <Path
        d="M14 30 L20 24 L26 27 L32 18"
        stroke={b.light}
        strokeWidth={2.4}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.35}
        transform="translate(0.6, 0.8)"
      />
      <Path
        d="M14 30 L20 24 L26 27 L32 18"
        stroke="#fff"
        strokeWidth={2.4}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="20" cy="24" r="2.2" fill={b.light} />
      <Circle cx="26" cy="27" r="2.2" fill={b.light} />
      <Path d="M30 14 L36 18 L30 22 Z" fill="#fff" />
      <Circle cx="32" cy="16" r="2.8" fill={b.highlight} opacity={0.95} />
    </G>
  );
}

function PodMark({ b }: MarkProps) {
  return (
    <G>
      <Path
        d="M16 17 H29 C31 17 32.5 18.5 32.5 20.5 V31.5 C32.5 33.5 31 35 29 35 H18 C16 35 14.5 33.5 14.5 31.5 V20.5 C14.5 18.5 16 17 18 17 Z"
        fill="#fff"
        opacity={0.25}
        transform="translate(0.5, 0.8)"
      />
      <Path
        d="M15.5 16.5 H28.5 C30.5 16.5 32 18 32 20 V31 C32 33 30.5 34.5 28.5 34.5 H17.5 C15.5 34.5 14 33 14 31 V20 C14 18 15.5 16.5 17.5 16.5 Z"
        fill="#fff"
      />
      <Path d="M27 16.5 V14.5 C27 13.2 28 12.2 29.3 12.2 H34.5 V16.5 H27 Z" fill={b.light} />
      <Path
        d="M18 27.5 L21.5 31 L29.5 22.5"
        stroke={b.secondary}
        strokeWidth={2.4}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </G>
  );
}

function InvoiceMark({ b }: MarkProps) {
  return (
    <G>
      <Rect x="17" y="14" width="16" height="20" rx="2.5" fill="#fff" opacity={0.28} transform="translate(1, 1.2)" />
      <Rect x="16" y="13" width="16" height="20" rx="2.5" fill="#fff" opacity={0.55} />
      <Rect x="14" y="15" width="16" height="20" rx="2.5" fill="#fff" />
      <Rect x="17" y="19" width="10" height="1.6" rx="0.8" fill={b.secondary} opacity={0.35} />
      <Rect x="17" y="23" width="7" height="1.6" rx="0.8" fill={b.secondary} opacity={0.35} />
      <Circle cx="27" cy="30" r="4" fill={b.highlight} />
      <Path
        d="M25.2 30 L26.8 31.6 L29.2 28.8"
        stroke="#fff"
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </G>
  );
}

function FinanceMark({ b }: MarkProps) {
  return (
    <G>
      <Rect x="15" y="28" width="5" height="7" rx="1.2" fill="#fff" opacity={0.45} />
      <Rect x="21.5" y="24" width="5" height="11" rx="1.2" fill="#fff" opacity={0.65} />
      <Rect x="28" y="19" width="5" height="16" rx="1.2" fill="#fff" />
      <Path
        d="M16 21 L24 17 L32 20"
        stroke={b.light}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="32" cy="20" r="2" fill={b.highlight} />
    </G>
  );
}

function FleetMark({ b }: MarkProps) {
  return (
    <G>
      <Path
        d="M13 26 H26 L30 26 L33 29 V32 H13 Z"
        fill="#fff"
        opacity={0.35}
        transform="translate(0.6, 0.8)"
      />
      <Path d="M12.5 25.5 H25.5 L29.5 25.5 L32.5 28.5 V31.5 H12.5 Z" fill="#fff" />
      <Path d="M25.5 25.5 H31.5 L34 28.5 V31.5 H25.5 V25.5 Z" fill={b.light} opacity={0.85} />
      <Rect x="14" y="21" width="8" height="5" rx="1.2" fill="#fff" opacity={0.9} />
      <Circle cx="17" cy="31.5" r="2.2" fill={b.depth} opacity={0.55} />
      <Circle cx="29" cy="31.5" r="2.2" fill={b.depth} opacity={0.55} />
      <Circle cx="17" cy="31.5" r="1.2" fill={b.highlight} />
      <Circle cx="29" cy="31.5" r="1.2" fill={b.highlight} />
    </G>
  );
}

function PeopleMark({ b }: MarkProps) {
  return (
    <G>
      <Circle cx="24" cy="19" r="5.5" fill="#fff" />
      <Path
        d="M15 33 C15.5 28 19 25.5 24 25.5 C29 25.5 32.5 28 33 33"
        fill="#fff"
        opacity={0.92}
      />
      <Circle cx="29.5" cy="20.5" r="4" fill={b.light} opacity={0.85} />
      <Path
        d="M26 32 C26.5 29.5 28.5 28 31 28 C33 28 34.5 29 35 32"
        fill={b.light}
        opacity={0.85}
      />
    </G>
  );
}

function TalentMark({ b }: MarkProps) {
  return (
    <G>
      <Path
        d="M24 14 L26.2 19.5 H32 L27.4 22.8 L29.6 28.5 L24 25.2 L18.4 28.5 L20.6 22.8 L16 19.5 H21.8 Z"
        fill="#fff"
        opacity={0.3}
        transform="translate(0.5, 0.8)"
      />
      <Path
        d="M24 13.5 L26 18.8 H31.2 L26.8 21.8 L28.8 27 L24 24.2 L19.2 27 L21.2 21.8 L16.8 18.8 H22 Z"
        fill="#fff"
      />
      <Circle cx="24" cy="20" r="2.2" fill={b.highlight} />
    </G>
  );
}

function MarketplaceMark({ b }: MarkProps) {
  return (
    <G>
      <Path
        d="M14 22 L17 15 H31 L34 22 V32 H14 Z"
        fill="#fff"
        opacity={0.3}
        transform="translate(0.5, 0.8)"
      />
      <Path d="M13.5 21.5 L16.5 14.5 H30.5 L33.5 21.5 V31.5 H13.5 Z" fill="#fff" />
      <Path
        d="M13.5 21.5 H33.5"
        stroke={b.secondary}
        strokeWidth={1.2}
        opacity={0.35}
      />
      <Path
        d="M18 14.5 V12.5 H21 V14.5 M27 14.5 V12.5 H30 V14.5"
        stroke={b.light}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <Rect x="20" y="25" width="8" height="5" rx="1" fill={b.highlight} />
    </G>
  );
}

function ExchangeMark({ b }: MarkProps) {
  return (
    <G>
      <Circle cx="24" cy="24" r="10" fill="#fff" opacity={0.22} />
      <Circle cx="24" cy="24" r="9" fill="#fff" opacity={0.55} />
      <Path
        d="M17 22 H27 M24.5 19 L27.5 22 L24.5 25"
        stroke={b.secondary}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M31 26 H21 M23.5 23 L20.5 26 L23.5 29"
        stroke="#fff"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </G>
  );
}

function ComplianceMark({ b }: MarkProps) {
  return (
    <G>
      <Path
        d="M24 12 L34 16.5 V24.5 C34 29.5 24 35 24 35 C24 35 14 29.5 14 24.5 V16.5 Z"
        fill="#fff"
        opacity={0.28}
        transform="translate(0.5, 0.8)"
      />
      <Path
        d="M24 11.5 L33.5 15.8 V24 C33.5 28.8 24 34 24 34 C24 34 14.5 28.8 14.5 24 V15.8 Z"
        fill="#fff"
      />
      <Path
        d="M18.5 24 L22 27.5 L29.5 20"
        stroke={b.secondary}
        strokeWidth={2.4}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M24 11.5 L26 13 L24 14.5 L22 13 Z"
        fill={b.highlight}
        opacity={0.9}
      />
    </G>
  );
}

function AiMark({ b }: MarkProps) {
  return (
    <G>
      <Circle cx="24" cy="17" r="4.5" fill="#fff" />
      <Circle cx="16.5" cy="29" r="3.5" fill={b.light} />
      <Circle cx="31.5" cy="29" r="3.5" fill={b.light} />
      <Path
        d="M24 21 V26 M21 27 L18 28.5 M27 27 L30 28.5"
        stroke="#fff"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Path
        d="M20 19 L17.5 26 M28 19 L30.5 26"
        stroke="#fff"
        strokeWidth={1.6}
        strokeLinecap="round"
        opacity={0.85}
      />
      <Circle cx="24" cy="15.5" r="1.2" fill={b.highlight} />
    </G>
  );
}

const MARKS: Record<ProductId, (props: MarkProps) => ReactElement> = {
  pulse_core: CoreMark,
  pulse_pod_pro: PodMark,
  pulse_invoice_pro: InvoiceMark,
  pulse_finance_pro: FinanceMark,
  pulse_fleet_pro: FleetMark,
  pulse_people: PeopleMark,
  pulse_talent: TalentMark,
  pulse_marketplace: MarketplaceMark,
  pulse_exchange: ExchangeMark,
  pulse_compliance: ComplianceMark,
  pulse_ai: AiMark,
};

export type ProductLogoProps = {
  productId: ProductId;
  size?: number;
  muted?: boolean;
  active?: boolean;
  showActiveDot?: boolean;
};

/** Glossy 3D product tile with embossed symbol — enterprise app-icon style. */
export function ProductLogo({
  productId,
  size = 48,
  muted = false,
  active = false,
  showActiveDot = false,
}: ProductLogoProps) {
  const b = brandFor(productId, muted && !active);
  const Mark = MARKS[productId] ?? CoreMark;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <GlossyTile productId={productId} b={b}>
          <Mark b={b} productId={productId} />
        </GlossyTile>
      </Svg>
      {showActiveDot && active ? <View style={styles.activeDot} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  activeDot: {
    position: "absolute",
    top: -1,
    right: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.primary,
    borderWidth: 1.5,
    borderColor: Theme.cardWhite,
  },
});

export function productBrandColor(productId: ProductId): string {
  return PRODUCT_BRAND[productId]?.primary ?? Theme.primary;
}
