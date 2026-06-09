import type { PartyEntityType } from "@/lib/partyAvatarDisplay";

export type ProjectPersonFace = {
  id: string;
  name: string;
  avatar_url?: string | null;
  avatar_seed?: string | null;
  entityType: PartyEntityType;
};

type PartyRow = {
  id: string;
  name?: string | null;
  avatar_url?: string | null;
  avatar_seed?: string | null;
};

const MAX_VISIBLE = 3;

export function buildProjectPeopleStack(
  rows: PartyRow[],
  entityType: PartyEntityType,
): { faces: ProjectPersonFace[]; overflow: number; total: number } {
  const total = rows.length;
  const faces = rows.slice(0, MAX_VISIBLE).map((row) => ({
    id: row.id,
    name: row.name?.trim() || "Partner",
    avatar_url: row.avatar_url ?? null,
    avatar_seed: row.avatar_seed ?? null,
    entityType,
  }));
  const overflow = Math.max(0, total - MAX_VISIBLE);
  return { faces, overflow, total };
}
