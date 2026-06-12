/**
 * Mappers from domain-specific `Row` types into the unified
 * `PublicProfileEntity` view model consumed by `PublicProfileScreen`.
 *
 * All mappers are pure and synchronous; avatar resolution that requires
 * network (signed URLs) is handled by the route wrapper, which then sets
 * `avatarUrl` on the returned entity before rendering.
 */
import type { ClientRow } from "@/features/clients/services/clients.service";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import type {
    PublicProfileEntity,
    PublicProfileFact
} from "./types";

/** Build safe initials (max 2 letters) from a display name. */
export function buildInitials(name: string | null | undefined): string {
  const clean = (name ?? "").trim();
  if (!clean) return "·";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return clean.slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Years-since helper used for tenure / experience metrics. */
function yearsSinceIso(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const years = (Date.now() - t) / (365.25 * 24 * 60 * 60 * 1000);
  return Math.max(0, Math.round(years * 10) / 10);
}

/** Human-friendly date (e.g. "Apr 2024"). */
function formatMonthYear(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** Phone masking — show last 4 digits only for public view (privacy). */
function maskPhone(raw: string | null | undefined): string | null {
  const s = (raw ?? "").replace(/\D+/g, "");
  if (!s) return null;
  if (s.length <= 4) return `••${s}`;
  return `•• •• ${s.slice(-4)}`;
}

/* ───────────────────────────────────────────── Client ───────────────────────────────────────────── */

export function clientToPublicEntity(c: ClientRow): PublicProfileEntity {
  const isIntegrated = Boolean(c.is_integrated || c.linked_organization_id);
  const tenureYears = yearsSinceIso(c.created_at);
  const metrics: PublicProfileEntity["metrics"] = [
    {
      label: "TRUST TIER",
      value: isIntegrated ? "Gold" : "Standard",
      tint: isIntegrated ? "positive" : "default",
    },
    {
      label: "TENURE",
      value: tenureYears != null ? `${tenureYears}y` : "New",
    },
    {
      label: "SYNC STATE",
      value: isIntegrated ? "Live" : "Offline",
      tint: isIntegrated ? "positive" : "warning",
    },
  ];

  const facts: PublicProfileFact[] = [];
  if (c.display_id) {
    facts.push({ icon: "id", label: "Display ID", value: c.display_id });
  }
  if (c.gstin?.trim()) {
    facts.push({ icon: "briefcase", label: "GSTIN", value: c.gstin });
  }
  if (c.address?.trim()) {
    facts.push({ icon: "location", label: "Operational HQ", value: c.address });
  }
  if (c.phone?.trim()) {
    const masked = maskPhone(c.phone);
    if (masked) {
      facts.push({ icon: "phone", label: "Contact Channel", value: masked });
    }
  }
  const joined = formatMonthYear(c.created_at);
  if (joined) {
    facts.push({ icon: "calendar", label: "Joined Network", value: joined });
  }

  return {
    id: c.id,
    entityType: "client",
    name: c.name ?? "—",
    initials: buildInitials(c.name),
    avatarUrl: null,
    avatarSeed: c.avatar_seed ?? null,
    isIntegrated,
    isVerified: isIntegrated,
    subtitle: c.contact_person ?? null,
    bio:
      c.address
        ? `Operating out of ${c.address.split(",")[0]}. Connected via the Pulse network for real-time shared-ledger reconciliation.`
        : null,
    metrics,
    facts,
    fullDetailHref: `/client/${c.id}`,
    primaryCtaLabel: "Enter Shared Hub",
    synergyHeadline: isIntegrated ? "Live Shared Ledger" : "Invite to Shared Ledger",
    synergyBody: isIntegrated
      ? "Audit records sync both ways. Review variances, confirm payments, and close disputes in one place."
      : "Connect this client on Pulse to unlock Compare & Verify and real-time shared ledger.",
  };
}

/* ───────────────────────────────────────────── Supplier ───────────────────────────────────────────── */

export function supplierToPublicEntity(s: SupplierRow): PublicProfileEntity {
  const isIntegrated =
    s.supplier_type === "integrated" || Boolean(s.linked_organization_id);
  const tenureYears = yearsSinceIso(s.created_at);
  const metrics: PublicProfileEntity["metrics"] = [
    {
      label: "TRUST TIER",
      value: s.is_verified ? "Verified" : isIntegrated ? "Gold" : "Standard",
      tint: s.is_verified || isIntegrated ? "positive" : "default",
    },
    {
      label: "TENURE",
      value: tenureYears != null ? `${tenureYears}y` : "New",
    },
    {
      label: "SYNC STATE",
      value: isIntegrated ? "Live" : "Offline",
      tint: isIntegrated ? "positive" : "warning",
    },
  ];

  const facts: PublicProfileFact[] = [];
  if (s.company_name?.trim()) {
    facts.push({ icon: "briefcase", label: "Company", value: s.company_name });
  }
  if (s.contact_person?.trim()) {
    facts.push({ icon: "id", label: "Contact", value: s.contact_person });
  }
  if (s.gst_number?.trim()) {
    facts.push({ icon: "briefcase", label: "GSTIN", value: s.gst_number });
  }
  if (s.address?.trim()) {
    facts.push({ icon: "location", label: "Operational HQ", value: s.address });
  }
  if (s.phone?.trim()) {
    const masked = maskPhone(s.phone);
    if (masked) {
      facts.push({ icon: "phone", label: "Contact Channel", value: masked });
    }
  }
  const joined = formatMonthYear(s.created_at);
  if (joined) {
    facts.push({ icon: "calendar", label: "Joined Network", value: joined });
  }

  const display = s.company_name?.trim() || s.name || "—";

  return {
    id: s.id,
    entityType: "supplier",
    name: display,
    initials: buildInitials(display),
    avatarUrl: null,
    avatarSeed: s.avatar_seed ?? null,
    isIntegrated,
    isVerified: s.is_verified || isIntegrated,
    subtitle: s.contact_person ?? null,
    bio:
      s.address
        ? `Fleet operator based in ${s.address.split(",")[0]}. Servicing long-haul and regional routes on the Pulse network.`
        : null,
    metrics,
    facts,
    fullDetailHref: `/supplier/${s.id}`,
    primaryCtaLabel: "Enter Shared Hub",
    synergyHeadline: isIntegrated ? "Live Shared Ledger" : "Invite to Shared Ledger",
    synergyBody: isIntegrated
      ? "Every invoice and payment is mirrored across both books. Resolve variances with a tap."
      : "Connect this supplier on Pulse so payments, freight adjustments, and proofs stay in sync automatically.",
  };
}

/* ───────────────────────────────────────────── Driver ───────────────────────────────────────────── */

export function driverToPublicEntity(d: DriverRow): PublicProfileEntity {
  const tenureYears = yearsSinceIso(d.created_at);
  const statusLabel = (d.status ?? "").toLowerCase();
  const isActive = statusLabel === "active" && !d.left_at;

  const metrics: PublicProfileEntity["metrics"] = [
    {
      label: "STATUS",
      value: d.left_at ? "Alumni" : isActive ? "On Fleet" : "Off Duty",
      tint: isActive ? "positive" : d.left_at ? "negative" : "warning",
    },
    {
      label: "EXPERIENCE",
      value: tenureYears != null ? `${tenureYears}y` : "New",
    },
    {
      label: "COMMISSION",
      value:
        d.commission_percent != null
          ? `${d.commission_percent}%`
          : d.commission_per_km != null
            ? `₹${d.commission_per_km}/km`
            : d.payable_amount != null
              ? "Salary"
              : "—",
    },
  ];

  const facts: PublicProfileFact[] = [];
  if (d.assigned_vehicle_id) {
    facts.push({
      icon: "truck",
      label: "Assigned Vehicle",
      value: "Linked to fleet",
    });
  }
  if (d.phone?.trim()) {
    const masked = maskPhone(d.phone);
    if (masked) {
      facts.push({ icon: "phone", label: "Contact Channel", value: masked });
    }
  }
  if (d.email?.trim()) {
    facts.push({ icon: "email", label: "Email", value: d.email });
  }
  const joined = formatMonthYear(d.created_at);
  if (joined) {
    facts.push({ icon: "calendar", label: "On Fleet Since", value: joined });
  }
  if (d.left_at) {
    const left = formatMonthYear(d.left_at);
    if (left) {
      facts.push({ icon: "calendar", label: "Left Fleet", value: left });
    }
  }

  return {
    id: d.id,
    entityType: "driver",
    name: d.name ?? "—",
    initials: buildInitials(d.name),
    avatarUrl: null,
    avatarSeed: d.avatar_seed ?? null,
    /** Drivers are always "internal" — we treat them as integrated so the
     *  verified badge is visible; there's no external org to link. */
    isIntegrated: true,
    isVerified: !d.left_at,
    subtitle: d.assigned_vehicle_id ? "Active driver · Assigned vehicle" : "Active driver",
    bio: d.left_at
      ? "This driver is part of your passbook history. Record of trips and settlements preserved."
      : "On-duty driver. Trips, earnings, and settlements update in real time on your fleet dashboard.",
    metrics,
    facts,
    fullDetailHref: `/driver/${d.id}`,
    primaryCtaLabel: "Open Fleet Details",
    synergyHeadline: null,
    synergyBody: null,
  };
}
