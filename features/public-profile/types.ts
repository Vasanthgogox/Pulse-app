/**
 * Public-profile entity model.
 *
 * A normalized, minimal shape used by `PublicProfileScreen` so the view
 * can stay ignorant of whether the underlying record is a client, supplier,
 * or driver. The route wrapper fetches the concrete row and maps it into
 * this shape via helpers in `./mappers.ts`.
 */

export type PublicProfileEntityType = "client" | "supplier" | "driver";

export interface PublicProfileMetric {
  label: string;
  /** Big value. Pass a pre-formatted string so the view doesn't format. */
  value: string;
  /** Small trailing glyph (e.g. "★"). Optional. */
  suffix?: string;
  /** Tint: default = on-dark white, accent = green. */
  tint?: "default" | "positive" | "warning" | "negative";
}

export interface PublicProfileFact {
  icon: "industry" | "location" | "phone" | "email" | "calendar" | "id" | "briefcase" | "truck";
  label: string;
  value: string;
}

export interface PublicProfileEntity {
  id: string;
  entityType: PublicProfileEntityType;
  /** Display name (e.g. "AASAAR LOGISTICS"). */
  name: string;
  /** 2–3 letter initials used as avatar fallback. */
  initials: string;
  /** Resolved avatar URL (may be a DiceBear / signed-storage URL). */
  avatarUrl: string | null;
  /** Avatar seed fallback when URL is not available. */
  avatarSeed?: string | null;
  /** True when this party has a linked org on the platform. */
  isIntegrated: boolean;
  /** Admin / KYC verified (`organizations.verification_status = verified`). */
  isVerified: boolean;
  /** Raw KYC status for Verified / Not verified / Pending tags. */
  verificationStatus?: string | null;
  /** One-line subtitle under the name on the hero — e.g. company / industry. */
  subtitle: string | null;
  /** Free-form short bio shown in the quote block. Falls back to a sensible default. */
  bio: string | null;
  /** Three metric tiles in the floating dark island. */
  metrics: [PublicProfileMetric, PublicProfileMetric, PublicProfileMetric];
  /** Fact rows in "Core Intel". */
  facts: PublicProfileFact[];
  /** Route to jump into the full detail experience (client/supplier/driver). */
  fullDetailHref: string;
  /** Label shown on the primary CTA (differs for driver vs business). */
  primaryCtaLabel: string;
  /** Secondary stat used by the "Network Lock-In" card. */
  synergyHeadline: string | null;
  /** Small copy line inside the synergy card. */
  synergyBody: string | null;
}
