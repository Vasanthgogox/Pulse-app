import type { AssignmentAvatarGridItem } from "@/features/trips/components/AssignmentEntityAvatarGrid";
import type { ClientRow } from "@/features/clients/services/clients.service";

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

export function clientsToAvatarGridItems(clients: ClientRow[]): AssignmentAvatarGridItem[] {
  return clients.map(clientToAvatarGridItem);
}
