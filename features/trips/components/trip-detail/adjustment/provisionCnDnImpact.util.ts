import type {
  TripAdjustmentImpact,
  TripAdjustmentType,
} from "@/features/trips/services/tripAdjustments";

export type ProvisionCnDnImpactParams = {
  type: TripAdjustmentType;
  impact: TripAdjustmentImpact;
  isAssetDriverCost?: boolean;
};

/** Short label explaining what CN/DN does to sale income or supplier cost. */
export function getProvisionCnDnImpactTag(params: ProvisionCnDnImpactParams): string {
  const { type, impact, isAssetDriverCost } = params;
  if (isAssetDriverCost) {
    return impact === "minus" ? "Reduces driver pay" : "Increases driver pay";
  }
  if (type === "revenue") {
    return impact === "minus" ? "Reduces income" : "Increases income";
  }
  return impact === "minus" ? "Reduces cost" : "Increases cost";
}

/** Green = lowers your exposure; rose = raises billed/payable amount. */
export function getProvisionCnDnImpactTagTone(
  params: ProvisionCnDnImpactParams,
): "positive" | "negative" {
  const { type, impact, isAssetDriverCost } = params;
  if (isAssetDriverCost) {
    return impact === "minus" ? "positive" : "negative";
  }
  if (type === "revenue") {
    return impact === "plus" ? "positive" : "negative";
  }
  return impact === "minus" ? "positive" : "negative";
}
