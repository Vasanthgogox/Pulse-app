import type { ImageSourcePropType } from "react-native";

export type PaymentTypePngAsset = {
  kind: "png";
  source: ImageSourcePropType;
  glyphScale?: number;
};

export type PaymentTypeLottieAsset = {
  kind: "lottie";
  source: object;
  glyphScale?: number;
  speed?: number;
};

export type PaymentTypeAsset = PaymentTypePngAsset | PaymentTypeLottieAsset;

/** Colourful glyphs for ledger payment-type tiles (PNG + Lottie from `assets/`). */
export const PAYMENT_TYPE_ASSETS: Record<string, PaymentTypeAsset> = {
  "Trip Payment": {
    kind: "png",
    source: require("@/assets/icon and logos/truck.png"),
    glyphScale: 0.92,
  },
  "Advance Payment": {
    kind: "lottie",
    source: require("@/assets/Animated folder/withdraw-cash.json"),
    glyphScale: 1.55,
  },
  "Advance from Client": {
    kind: "lottie",
    source: require("@/assets/Animated folder/investment-growth.json"),
    glyphScale: 1.5,
  },
  Advance: {
    kind: "lottie",
    source: require("@/assets/Animated folder/investment-growth.json"),
    glyphScale: 1.5,
  },
  advance: {
    kind: "lottie",
    source: require("@/assets/Animated folder/withdraw-cash.json"),
    glyphScale: 1.55,
  },
  "Partial Payment": {
    kind: "lottie",
    source: require("@/assets/Animated folder/compare-scale.json"),
    glyphScale: 1.5,
  },
  "Balance Payment": {
    kind: "lottie",
    source: require("@/assets/Animated folder/check-mark.json"),
    glyphScale: 1.45,
  },
  settlement: {
    kind: "lottie",
    source: require("@/assets/Animated folder/check-mark.json"),
    glyphScale: 1.45,
  },
  "Extra Charges": {
    kind: "png",
    source: require("@/assets/file type icons/add.png"),
    glyphScale: 0.88,
  },
  "Detention Charges": {
    kind: "lottie",
    source: require("@/assets/Animated folder/fast-turtle.json"),
    glyphScale: 1.55,
  },
  "Cancellation Charges": {
    kind: "lottie",
    source: require("@/assets/Animated folder/trash-can.json"),
    glyphScale: 1.45,
  },
  Commission: {
    kind: "lottie",
    source: require("@/assets/Animated folder/revenue.json"),
    glyphScale: 1.08,
  },
  "DRIVER COMMISSION": {
    kind: "lottie",
    source: require("@/assets/Animated folder/revenue.json"),
    glyphScale: 1.08,
  },
  Penalty: {
    kind: "lottie",
    source: require("@/assets/Animated folder/trash-can.json"),
    glyphScale: 1.05,
  },
  Adjustment: {
    kind: "lottie",
    source: require("@/assets/Animated folder/reports.json"),
    glyphScale: 1.45,
  },
  adjustment: {
    kind: "lottie",
    source: require("@/assets/Animated folder/reports.json"),
    glyphScale: 1.45,
  },
  Other: {
    kind: "png",
    source: require("@/assets/icon and logos/partner.png"),
    glyphScale: 0.9,
  },
  salary: {
    kind: "png",
    source: require("@/assets/icon and logos/taxi-driver.png"),
    glyphScale: 1.05,
  },
  reimbursement: {
    kind: "lottie",
    source: require("@/assets/Animated folder/savings.json"),
    glyphScale: 1.08,
  },
  bonus: {
    kind: "lottie",
    source: require("@/assets/Animated folder/money-bag.json"),
    glyphScale: 1.08,
  },
  deduction: {
    kind: "lottie",
    source: require("@/assets/Animated folder/trash-can.json"),
    glyphScale: 1.05,
  },
  "SUPPLIER PAYMENT": {
    kind: "png",
    source: require("@/assets/file type icons/dollar-calendar.png"),
    glyphScale: 1.05,
  },
  "DRIVER SALARY": {
    kind: "png",
    source: require("@/assets/file type icons/dollar-calendar.png"),
    glyphScale: 1.05,
  },
  "SUPPLIER COST": {
    kind: "png",
    source: require("@/assets/file type icons/dollar-calendar.png"),
    glyphScale: 1.05,
  },
  Fuel: {
    kind: "lottie",
    source: require("@/assets/Animated folder/gasoline can.json"),
    glyphScale: 1.08,
  },
  Toll: {
    kind: "lottie",
    source: require("@/assets/Animated folder/navigation.json"),
    glyphScale: 1.08,
  },
  Maintenance: {
    kind: "lottie",
    source: require("@/assets/Animated folder/forklift.json"),
    glyphScale: 1.08,
  },
  Repair: {
    kind: "lottie",
    source: require("@/assets/Animated folder/manufacturing-unit.json"),
    glyphScale: 1.08,
  },
  Tyre: {
    kind: "lottie",
    source: require("@/assets/Animated folder/parcel-protection.json"),
    glyphScale: 1.08,
  },
  Insurance: {
    kind: "lottie",
    source: require("@/assets/Animated folder/security.json"),
    glyphScale: 1.08,
  },
  "Permit / Tax": {
    kind: "lottie",
    source: require("@/assets/Animated folder/law approved.json"),
    glyphScale: 1.08,
  },
  Parking: {
    kind: "lottie",
    source: require("@/assets/Animated folder/navigation-pin.json"),
    glyphScale: 1.08,
  },
  Cleaning: {
    kind: "lottie",
    source: require("@/assets/Animated folder/positive-feedback.json"),
    glyphScale: 1.08,
  },
};

export function getPaymentTypeAsset(kind: string): PaymentTypeAsset | undefined {
  const key = kind.trim();
  if (!key) return undefined;
  return PAYMENT_TYPE_ASSETS[key];
}
