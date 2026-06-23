/**
 * Party-type accent colors for avatars (Network connections, finance party detail).
 *
 * Client → purple (indigo)
 * Supplier → brown (amber fleet tone — `networkBadgeDriver*` / `networkDriverTint*`)
 * Driver → green (`networkBadgeSupplier*` / `networkSupplierTint*`)
 */
import Theme from "@/constants/Theme";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";

export type PartyRoleLabel = "CLIENT" | "SUPPLIER" | "DRIVER";

export type PartyEntityAccent = {
  ring: string;
  glow: string;
  glowCore: string;
  tint: string;
};

const CLIENT_ACCENT: PartyEntityAccent = {
  ring: Theme.networkBadgeClientText,
  glow: "rgba(67, 56, 202, 0.32)",
  glowCore: "rgba(79, 70, 229, 0.18)",
  tint: Theme.networkClientTintBg,
};

/** Supply-side partners — golden yellow on dark ink (offline / hub tiles). */
const SUPPLIER_ACCENT: PartyEntityAccent = {
  ring: Theme.brandBlueInk,
  glow: "rgba(255, 206, 68, 0.34)",
  glowCore: Theme.accentGoldMuted,
  tint: Theme.accentGoldMuted,
};

/** Fleet drivers — green (finance supplier-cost / positive lane tone). */
const DRIVER_ACCENT: PartyEntityAccent = {
  ring: Theme.networkBadgeSupplierText,
  glow: "rgba(22, 101, 52, 0.34)",
  glowCore: "rgba(34, 197, 94, 0.14)",
  tint: Theme.networkSupplierTintBg,
};

export function partyAccentFromEntityType(
  entityType: PartyEntityType,
): PartyEntityAccent {
  if (entityType === "supplier") return SUPPLIER_ACCENT;
  if (entityType === "driver") return DRIVER_ACCENT;
  return CLIENT_ACCENT;
}

export function partyAccentFromConnectionRole(
  role: PartyRoleLabel,
): PartyEntityAccent {
  if (role === "SUPPLIER") return SUPPLIER_ACCENT;
  if (role === "DRIVER") return DRIVER_ACCENT;
  return CLIENT_ACCENT;
}
