import type { AssignmentAvatarGridItem } from "@/features/trips/components/AssignmentEntityAvatarGrid";
import type { ClientRow } from "@/features/clients/services/clients.service";

import { resolveWizardClientPhone } from "./clientContactDisplay.util";

export function clientToAvatarGridItem(c: ClientRow): AssignmentAvatarGridItem {
  const title = c.name?.trim() || c.contact_person?.trim() || "—";
  const subtitle = [c.address, c.phone, c.email].filter(Boolean).join(" · ");
  return {
    id: c.id,
    title,
    subtitle: subtitle || undefined,
    avatarUrl: c.avatar_url ?? null,
    avatarSeed: c.avatar_seed ?? null,
    entityType: "client",
  };
}

export function clientToWizardAvatarGridItem(c: ClientRow): AssignmentAvatarGridItem {
  const title = c.name?.trim() || c.contact_person?.trim() || "—";
  return {
    id: c.id,
    title,
    subtitle: resolveWizardClientPhone(c.phone) ?? undefined,
    avatarUrl: c.avatar_url ?? null,
    avatarSeed: c.avatar_seed ?? null,
    entityType: "client",
  };
}

export function clientsToAvatarGridItems(clients: ClientRow[]): AssignmentAvatarGridItem[] {
  return clients.map(clientToAvatarGridItem);
}

/** Wizard party tiles — phone-only subtitle, sorted A–Z (attribution parity). */
export function clientsToWizardAvatarGridItems(
  clients: ClientRow[],
): AssignmentAvatarGridItem[] {
  return [...clients]
    .sort((a, b) =>
      (a.name ?? a.contact_person ?? "").localeCompare(
        b.name ?? b.contact_person ?? "",
        "en",
        { sensitivity: "base" },
      ),
    )
    .map(clientToWizardAvatarGridItem);
}
