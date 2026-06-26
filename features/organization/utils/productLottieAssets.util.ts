import type { ProductId } from "@/lib/productRegistry";

export type ProductLottieAsset = {
  source: object;
  /** Compensates for transparent padding inside the Lottie canvas. */
  glyphScale?: number;
  /** Playback speed — matches chat empty-state animations when set. */
  speed?: number;
};

/** Same asset as chat trip-driver empty state (`ChatScreen` NEW_TRIP_DRIVER_EMPTY_ANIMATION). */
const CHAT_TRIP_DRIVER_LOTTIE = require("@/assets/Animated folder/drunk-driver.json");

/** Colourful Lottie glyphs for connected Pulse modules (hub grid + catalogue). */
export const PRODUCT_LOTTIE_ASSETS: Record<ProductId, ProductLottieAsset> = {
  pulse_core: {
    source: require("@/assets/Animated folder/logistics.json"),
    glyphScale: 1.14,
  },
  pulse_driver: {
    source: CHAT_TRIP_DRIVER_LOTTIE,
    glyphScale: 1.95,
    speed: 0.8,
  },
  pulse_network: {
    source: require("@/assets/Animated folder/reactions.json"),
    glyphScale: 1.12,
  },
  pulse_network_bidding: {
    source: require("@/assets/Animated folder/auction.json"),
    glyphScale: 1.12,
  },
  pulse_chat: {
    source: require("@/assets/Animated folder/lets-chat.json"),
    glyphScale: 1.12,
  },
  pulse_pod_pro: {
    source: require("@/assets/Animated folder/approved-note.json"),
    glyphScale: 1.1,
  },
  pulse_invoice_pro: {
    source: require("@/assets/Animated folder/payment.json"),
    glyphScale: 1.08,
  },
  pulse_finance_pro: {
    source: require("@/assets/Animated folder/finance-presentation.json"),
    glyphScale: 1.1,
  },
  pulse_fleet_pro: {
    source: require("@/assets/Animated folder/delivery-truckcargo-truck.json"),
    glyphScale: 1.08,
  },
  pulse_people: {
    source: require("@/assets/Animated folder/add-user.json"),
    glyphScale: 1.1,
  },
  pulse_talent: {
    source: require("@/assets/Animated folder/search.json"),
    glyphScale: 1.1,
  },
  pulse_marketplace: {
    source: require("@/assets/Animated folder/auction.json"),
    glyphScale: 1.08,
  },
  pulse_exchange: {
    source: require("@/assets/Animated folder/online-payments.json"),
    glyphScale: 1.08,
  },
  pulse_compliance: {
    source: require("@/assets/Animated folder/security.json"),
    glyphScale: 1.1,
  },
  pulse_ai: {
    source: require("@/assets/Animated folder/robot.json"),
    glyphScale: 1.1,
  },
};
