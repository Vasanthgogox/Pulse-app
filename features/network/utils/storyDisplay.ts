/**
 * Story/load display formatting — extracted from StoryDetailScreen so the
 * same route/vehicle/date rendering can be reused for a snapshotted Reach
 * campaign (features/reach/), which no longer has a live PostRow to read
 * from once the source story is edited or deleted. Every function here
 * takes plain fields rather than a PostRow, so both a live post and a
 * reach_campaigns snapshot row can call the same formatting.
 */
import { hasVehicleMarker, stripVehicleMarker } from '@/features/network/services/posts.service';

export type StoryPostType = 'UPDATE' | 'LOAD' | 'VEHICLE_AVAILABILITY';

export interface StoryContentFields {
  content: string | null;
  origin: string | null;
  destination: string | null;
  material: string | null;
}

/** Vehicle-availability posts are physically stored as `type: 'UPDATE'` with
 * a `[VEHICLE_AVAILABILITY]` marker prefixed on `content` — this reclassifies
 * a raw stored type/content pair the same way normalizeFeedPost does for a
 * live post, so a snapshot (which preserves the raw marker) classifies
 * identically. */
export function classifyStoredPostType(
  storedType: string | null | undefined,
  content: string | null | undefined,
): StoryPostType {
  if (storedType === 'LOAD') return 'LOAD';
  if (storedType === 'VEHICLE_AVAILABILITY' || hasVehicleMarker(content)) return 'VEHICLE_AVAILABILITY';
  return 'UPDATE';
}

/** Strips the vehicle marker for display, if present — safe to call on any
 * content regardless of type. */
export function displayStoryContent(content: string | null | undefined): string | null {
  return stripVehicleMarker(content ?? null);
}

export function formatStoryDate(d: string): string {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** True for Fleet Owner organic capacity posts (null org, VEHICLE_AVAILABILITY). */
export function isFleetOwnerCapacityPost(post: {
  type?: string | null;
  organization_id?: string | null;
}): boolean {
  return (
    (post.type ?? '').toUpperCase() === 'VEHICLE_AVAILABILITY' &&
    (post.organization_id == null || String(post.organization_id).trim() === '')
  );
}

/** Capacity chip: "16" → "16T"; leave non-numeric material unchanged. */
export function formatCapacityMaterial(material: string | null | undefined): string | null {
  const raw = (material ?? '').trim();
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) return `${raw}T`;
  if (/^\d+(\.\d+)?\s*t(onnes?)?$/i.test(raw)) {
    return `${raw.match(/^\d+(\.\d+)?/)?.[0] ?? raw}T`;
  }
  return raw;
}

export function storyHeadline(fields: StoryContentFields, isLoad: boolean, isVehicle: boolean): string {
  const t = fields.content?.trim();
  if (t) return t;
  if (isLoad && fields.origin && fields.destination) {
    const mat = fields.material?.trim();
    if (mat) return `${mat} · ${fields.origin} → ${fields.destination}`;
    return `${fields.origin} → ${fields.destination}`;
  }
  if (isVehicle && fields.origin) return `Available @ ${fields.origin}`;
  return 'Active broadcast';
}

export function storyTypeLabel(type: StoryPostType): string {
  if (type === 'LOAD') return 'LOAD BROADCAST';
  if (type === 'VEHICLE_AVAILABILITY') return 'CAPACITY ALERT';
  return 'NETWORK UPDATE';
}

export function splitLocationParts(value: string | null | undefined): {
  city: string;
  state: string;
} {
  const raw = (value ?? '').trim();
  if (!raw) return { city: '—', state: '' };
  const [city, ...rest] = raw.split(',').map((part) => part.trim()).filter(Boolean);
  return {
    city: city || raw,
    state: rest.join(', '),
  };
}

export function loadMaterialLabel(fields: Pick<StoryContentFields, 'material'>, fallbackHeadline: string): string {
  const material = fields.material?.trim();
  if (material) return material;
  const beforeRoute = fallbackHeadline.split('→')[0]?.split('•')[0]?.split('·')[0]?.trim();
  return beforeRoute || 'Load';
}
