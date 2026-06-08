/**
 * GlobalIdentityService — Phase 2 Identity Platform
 *
 * Single authoritative source for ALL identity generation in Pulse.
 * No module should generate IDs directly; consume this service instead.
 *
 * Architecture:
 *   Internal PKs   → UUIDv7 (time-sortable, index-friendly, event-stream ready)
 *   Business refs  → TRP-26-AB4K7F (globally unique, human-readable, non-sequential)
 *   Network refs   → BKG-H8K2P7 (cross-org workflows, marketplace, collaboration)
 *   Optimistic IDs → ULID (client-side, never stored as PK)
 *
 * Guarantees:
 *   1. Entity IDs never change (PKs are immutable)
 *   2. References can change (business refs are mutable display handles)
 *   3. All joins/FKs use UUIDs (never business references)
 *   4. Collision probability: < 1 in 2^62 per call (UUIDv7 rand_b)
 */

import { supabase } from '@/lib/supabase';
import { uuidv7 } from '@/lib/uuidv7';

// ── Crockford Base32 (no ambiguous chars: no O, I, L, U) ─────────────────────
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// ── Entity Type Registry ─────────────────────────────────────────────────────

export type EntityType =
  | 'trip'
  | 'indent'
  | 'driver'
  | 'fleet'
  | 'vehicle'
  | 'invoice'
  | 'booking'
  | 'shared_load'
  | 'collaboration'
  | 'organization'
  | 'pod'
  | 'transaction'
  | 'notification'
  | 'message';

export type NetworkIdentityType =
  | 'booking'
  | 'shared_load'
  | 'collaboration'
  | 'marketplace_order';

const ENTITY_PREFIX: Record<EntityType, string> = {
  trip:          'TRP',
  indent:        'IND',
  driver:        'DRV',
  fleet:         'FLT',
  vehicle:       'VEH',
  invoice:       'INV',
  booking:       'BKG',
  shared_load:   'SHR',
  collaboration: 'COL',
  organization:  'ORG',
  pod:           'POD',
  transaction:   'TXN',
  notification:  'NTF',
  message:       'MSG',
};

// ── Reference Parsing ────────────────────────────────────────────────────────

export interface ParsedReference {
  raw:       string;
  prefix:    string;
  year:      number | null;
  suffix:    string;
  entityType: EntityType | null;
  format:    'global'   // TRP-26-AB4K7F
           | 'network'  // BKG-H8K2P7
           | 'legacy'   // TRP001, GGV234GGVTRIP000001
           | 'fallback' // FTRP-0000001234
           | 'uuid'
           | 'unknown';
}

const UUID_RE   = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GLOBAL_RE = /^([A-Z]{3})-(\d{2})-([0-9A-HJ-NP-TV-Z]{6})$/;  // TRP-26-AB4K7F
const NETWORK_RE = /^([A-Z]{3})-([0-9A-HJ-NP-TV-Z]{6})$/;          // BKG-H8K2P7
const FALLBACK_RE = /^F(TRP|IND)-\d+$/;
const LEGACY_RE = /^[A-Z]{3}\d{3,}$/;

const PREFIX_TO_ENTITY: Record<string, EntityType> = Object.fromEntries(
  Object.entries(ENTITY_PREFIX).map(([k, v]) => [v, k as EntityType]),
);

// ── GlobalIdentityService ────────────────────────────────────────────────────

class _GlobalIdentityService {
  // ── ID generators ───────────────────────────────────────────────────────────

  /** Generate a UUIDv7 for use as a primary key. */
  generateId(): string { return uuidv7(); }

  /** Entity-specific ID generators (all return UUIDv7). */
  generateTripId():         string { return uuidv7(); }
  generateIndentId():       string { return uuidv7(); }
  generateDriverId():       string { return uuidv7(); }
  generateFleetId():        string { return uuidv7(); }
  generateVehicleId():      string { return uuidv7(); }
  generateInvoiceId():      string { return uuidv7(); }
  generateBookingId():      string { return uuidv7(); }
  generateOrganizationId(): string { return uuidv7(); }
  generateNotificationId(): string { return uuidv7(); }
  generateMessageId():      string { return uuidv7(); }
  generateActivityId():     string { return uuidv7(); }

  // ── Optimistic client-side ID (ULID) — NEVER store as PK ──────────────────

  /** Generate a ULID for optimistic UI state. Never use as a DB primary key. */
  generateOptimisticId(): string {
    const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    const now = Date.now();
    const buf = new Uint8Array(10);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(buf);
    } else {
      for (let i = 0; i < 10; i++) buf[i] = Math.floor(Math.random() * 256);
    }
    let timeStr = '';
    let t = now;
    for (let i = 9; i >= 0; i--) {
      timeStr = ENCODING[t % 32] + timeStr;
      t = Math.floor(t / 32);
    }
    const randStr = Array.from(buf).map(b => ENCODING[b % 32]).join('');
    return timeStr + randStr;
  }

  // ── Global business references (DB-backed) ──────────────────────────────────

  /**
   * Issue or retrieve a global business reference for an entity.
   * Idempotent: calling twice returns the same reference.
   *
   * @example generateGlobalRef('trip', tripId, orgId) → 'TRP-26-AB4K7F'
   */
  async generateGlobalRef(
    entityType: EntityType,
    entityId:   string,
    orgId?:     string,
  ): Promise<{ ref: string | null; error: Error | null }> {
    try {
      const { data, error } = await supabase().rpc('generate_global_reference', {
        p_entity_type: entityType,
        p_entity_id:   entityId,
        p_org_id:      orgId ?? null,
      });
      if (error) return { ref: null, error: new Error(error.message) };
      return { ref: String(data ?? ''), error: null };
    } catch (e) {
      return { ref: null, error: e instanceof Error ? e : new Error(String(e)) };
    }
  }

  // ── Network identity references ─────────────────────────────────────────────

  /**
   * Ensure a network-level reference exists for a cross-org workflow.
   *
   * @example ensureNetworkRef('booking', 'trip', tripId, orgId) → 'BKG-H8K2P7'
   */
  async ensureNetworkRef(
    identityType: NetworkIdentityType,
    primaryEntity: string,
    primaryId:    string,
    orgId:        string,
  ): Promise<{ ref: string | null; error: Error | null }> {
    try {
      const { data, error } = await supabase().rpc('ensure_network_identity', {
        p_identity_type:  identityType,
        p_primary_entity: primaryEntity,
        p_primary_id:     primaryId,
        p_org_id:         orgId,
      });
      if (error) return { ref: null, error: new Error(error.message) };
      return { ref: String(data ?? ''), error: null };
    } catch (e) {
      return { ref: null, error: e instanceof Error ? e : new Error(String(e)) };
    }
  }

  // ── Local reference generation (fallback when DB unavailable) ──────────────

  /**
   * Generate a global reference locally using crypto-random.
   * Use only when DB is unavailable. Mark as provisional.
   *
   * NOTE: This reference is NOT registered in global_references.
   * It must be registered when connectivity restores.
   */
  generateLocalRef(entityType: EntityType): string {
    const prefix = ENTITY_PREFIX[entityType] ?? entityType.toUpperCase().slice(0, 3);
    const year = new Date().getFullYear() % 100;
    const suffix = this._crockfordRandom(6);
    return `${prefix}-${year.toString().padStart(2, '0')}-${suffix}`;
  }

  /** Generate a network reference locally (provisional). */
  generateLocalNetworkRef(type: NetworkIdentityType): string {
    const prefix = ({ booking: 'BKG', shared_load: 'SHR', collaboration: 'COL', marketplace_order: 'MKT' })[type] ?? 'NET';
    return `${prefix}-${this._crockfordRandom(6)}`;
  }

  // ── Validation ───────────────────────────────────────────────────────────────

  /** Returns true if the string is a valid identity reference of ANY format. */
  isValidReference(ref: string | null | undefined): boolean {
    if (!ref || !ref.trim()) return false;
    const t = ref.trim();
    if (UUID_RE.test(t))     return true;
    if (GLOBAL_RE.test(t))   return true;
    if (NETWORK_RE.test(t))  return true;
    if (FALLBACK_RE.test(t)) return true;
    if (LEGACY_RE.test(t))   return true;
    return false;
  }

  /** Returns true if the string is a raw UUID (should not be shown to users). */
  isRawUuid(ref: string | null | undefined): boolean {
    return !!ref && UUID_RE.test(ref.trim());
  }

  /** Returns true if the reference is in the new global format (TRP-26-AB4K7F). */
  isGlobalRef(ref: string | null | undefined): boolean {
    return !!ref && GLOBAL_RE.test(ref.trim().toUpperCase());
  }

  /** Returns true if the reference is a network identity (BKG-H8K2P7). */
  isNetworkRef(ref: string | null | undefined): boolean {
    const t = (ref ?? '').trim().toUpperCase();
    return NETWORK_RE.test(t) && !GLOBAL_RE.test(t); // network = 2-part, global = 3-part
  }

  // ── Reference parsing ────────────────────────────────────────────────────────

  parse(ref: string | null | undefined): ParsedReference {
    const raw = (ref ?? '').trim();

    if (UUID_RE.test(raw)) {
      return { raw, prefix: '', year: null, suffix: raw, entityType: null, format: 'uuid' };
    }
    if (FALLBACK_RE.test(raw.toUpperCase())) {
      const parts = raw.split('-');
      return { raw, prefix: parts[0] ?? '', year: null, suffix: parts[1] ?? '', entityType: null, format: 'fallback' };
    }
    const globalMatch = GLOBAL_RE.exec(raw.toUpperCase());
    if (globalMatch) {
      const [, prefix, yearStr, suffix] = globalMatch;
      const year = parseInt('20' + yearStr, 10);
      return {
        raw, prefix,
        year,
        suffix,
        entityType: PREFIX_TO_ENTITY[prefix] ?? null,
        format: 'global',
      };
    }
    const networkMatch = NETWORK_RE.exec(raw.toUpperCase());
    if (networkMatch && !GLOBAL_RE.test(raw.toUpperCase())) {
      const [, prefix, suffix] = networkMatch;
      return { raw, prefix, year: null, suffix, entityType: null, format: 'network' };
    }
    if (LEGACY_RE.test(raw.toUpperCase())) {
      const prefix = raw.slice(0, 3).toUpperCase();
      return { raw, prefix, year: null, suffix: raw.slice(3), entityType: PREFIX_TO_ENTITY[prefix] ?? null, format: 'legacy' };
    }
    return { raw, prefix: '', year: null, suffix: raw, entityType: null, format: 'unknown' };
  }

  // ── Duplicate detection ──────────────────────────────────────────────────────

  private _pending = new Map<string, number>();
  private readonly DEDUP_TTL_MS = 10_000;

  /**
   * Returns true if this key was submitted recently (within 10s) — double-tap guard.
   * @example if (ids.isDuplicate(`trip:create:${orgId}`)) return;
   */
  isDuplicate(key: string): boolean {
    const last = this._pending.get(key);
    if (last && Date.now() - last < this.DEDUP_TTL_MS) return true;
    this._pending.set(key, Date.now());
    setTimeout(() => this._pending.delete(key), this.DEDUP_TTL_MS);
    return false;
  }

  clearDeduplication(): void { this._pending.clear(); }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private _crockfordRandom(length: number): string {
    const buf = new Uint8Array(length);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(buf);
    } else {
      for (let i = 0; i < length; i++) buf[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(buf).map(b => CROCKFORD[b % 32]).join('');
  }
}

// ── Singleton export ─────────────────────────────────────────────────────────

/** The global identity service singleton. Import and use everywhere. */
export const GlobalIdentityService = new _GlobalIdentityService();

// Convenience aliases matching the spec API
export const {
  generateId,
  generateTripId,
  generateIndentId,
  generateDriverId,
  generateFleetId,
  generateVehicleId,
  generateInvoiceId,
  generateBookingId,
  generateOrganizationId,
  generateNotificationId,
  generateMessageId,
  generateActivityId,
  generateOptimisticId,
  generateGlobalRef,
  ensureNetworkRef,
  generateLocalRef,
  generateLocalNetworkRef,
  isValidReference,
  isRawUuid,
  isGlobalRef,
  isNetworkRef,
  isDuplicate,
  clearDeduplication,
  parse: parseReference,
} = GlobalIdentityService;
