/**
 * GlobalSearchService — Phase 3 Search Architecture
 *
 * Single entry point for all search operations.
 * Currently backed by Postgres full-text; architecture is adapter-ready
 * for future Elasticsearch/OpenSearch migration.
 *
 * Supports searching by: UUID, business reference, vehicle number,
 * driver name, company name, location text.
 *
 * Scale target: 100M+ trips, 100M+ indents, sub-100ms search.
 */

import { supabase } from '@/lib/supabase';

export interface SearchResult {
  entityType:   string;
  entityId:     string;
  displayName:  string | null;
  reference:    string | null;
  secondaryRef: string | null;
  networkRef:   string | null;
  orgId:        string | null;
  rank:         number;
}

export interface SearchOptions {
  orgId?:   string | null;      // scope to org (null = global network search)
  types?:   string[];           // filter by entity type
  limit?:   number;
  offset?:  number;
}

export interface IndexEntry {
  entityType:    string;
  entityId:      string;
  orgId?:        string | null;
  displayName?:  string | null;
  reference?:    string | null;   // TRP-26-AB4K7F
  secondaryRef?: string | null;   // TRP001 legacy
  networkRef?:   string | null;   // BKG-H8K2P7
  vehicleNumber?: string | null;
  phone?:        string | null;
  locationText?: string | null;   // "Delhi, NCR → Mumbai, Maharashtra"
  tags?:         string[];
  relevanceBoost?: number;
}

class _GlobalSearchService {
  // ── Search ─────────────────────────────────────────────────────────────────

  /**
   * Full-text search across all indexed entities.
   * Handles: UUID, reference, vehicle number, name, location.
   */
  async search(
    query:   string,
    options: SearchOptions = {},
  ): Promise<{ results: SearchResult[]; error: Error | null }> {
    if (!query || query.trim().length < 2) {
      return { results: [], error: null };
    }

    try {
      const { data, error } = await supabase().rpc('global_search', {
        p_query:  query.trim(),
        p_org_id: options.orgId ?? null,
        p_types:  options.types ?? null,
        p_limit:  options.limit ?? 20,
        p_offset: options.offset ?? 0,
      });

      if (error) return { results: [], error: new Error(error.message) };

      const results: SearchResult[] = ((data ?? []) as Record<string, unknown>[]).map(r => ({
        entityType:   String(r.entity_type  ?? ''),
        entityId:     String(r.entity_id    ?? ''),
        displayName:  r.display_name  != null ? String(r.display_name)  : null,
        reference:    r.reference     != null ? String(r.reference)     : null,
        secondaryRef: r.secondary_ref != null ? String(r.secondary_ref) : null,
        networkRef:   r.network_ref   != null ? String(r.network_ref)   : null,
        orgId:        r.org_id        != null ? String(r.org_id)        : null,
        rank:         Number(r.rank ?? 0),
      }));

      return { results, error: null };
    } catch (err) {
      return { results: [], error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  /**
   * Fast lookup: resolve ANY reference format to entity UUID.
   * Handles: TRP-26-AB4K7F, TRP001, BKG-H8K2P7, raw UUID.
   */
  async lookupByReference(
    ref: string,
  ): Promise<{ entityType: string; entityId: string; orgId: string | null } | null> {
    if (!ref || !ref.trim()) return null;

    try {
      const { data, error } = await supabase().rpc('lookup_by_reference', {
        p_ref: ref.trim(),
      });
      if (error || !data || (data as unknown[]).length === 0) return null;

      const rows = data as Array<{ entity_type: string; entity_id: string; org_id: string | null }>;
      const row = rows[0];
      return {
        entityType: String(row.entity_type ?? ''),
        entityId:   String(row.entity_id   ?? ''),
        orgId:      row.org_id != null ? String(row.org_id) : null,
      };
    } catch {
      return null;
    }
  }

  // ── Index management ────────────────────────────────────────────────────────

  /** Index or update a single entity in the search index. */
  async index(entry: IndexEntry): Promise<void> {
    try {
      await supabase()
        .from('search_index')
        .upsert({
          entity_type:    entry.entityType,
          entity_id:      entry.entityId,
          org_id:         entry.orgId ?? null,
          display_name:   entry.displayName ?? null,
          reference:      entry.reference ?? null,
          secondary_ref:  entry.secondaryRef ?? null,
          network_ref:    entry.networkRef ?? null,
          vehicle_number: entry.vehicleNumber ?? null,
          phone:          entry.phone ?? null,
          location_text:  entry.locationText ?? null,
          tags:           entry.tags ?? [],
          relevance_boost: entry.relevanceBoost ?? 1.0,
          updated_at:     new Date().toISOString(),
        }, { onConflict: 'entity_id' });
    } catch (err) {
      console.warn('[SearchService] index failed:', err);
    }
  }

  /** Index a trip (convenience). */
  async indexTrip(trip: {
    id: string;
    organization_id: string | null;
    trip_number?: string | null;
    trip_code?: string | null;
    trip_operational_code?: string | null;
    pickup_area?: string | null;
    drop_location?: string | null;
    client_name?: string | null;
    driver_display_name?: string | null;
    vehicle_display_number?: string | null;
  }): Promise<void> {
    const location = [trip.pickup_area, trip.drop_location].filter(Boolean).join(' → ');
    await this.index({
      entityType:    'trip',
      entityId:      trip.id,
      orgId:         trip.organization_id,
      displayName:   trip.trip_operational_code ?? trip.trip_code ?? trip.trip_number ?? trip.id,
      reference:     undefined,   // filled by generate_global_reference
      secondaryRef:  trip.trip_operational_code ?? trip.trip_code ?? trip.trip_number ?? null,
      vehicleNumber: trip.vehicle_display_number ?? null,
      locationText:  location || null,
      tags: [
        trip.client_name,
        trip.driver_display_name,
        trip.vehicle_display_number,
      ].filter((t): t is string => !!t),
    });
  }

  /** Index a driver (convenience). */
  async indexDriver(driver: {
    id: string;
    organization_id: string | null;
    name?: string | null;
    phone?: string | null;
  }): Promise<void> {
    await this.index({
      entityType:  'driver',
      entityId:    driver.id,
      orgId:       driver.organization_id,
      displayName: driver.name ?? null,
      phone:       driver.phone ?? null,
    });
  }

  /** Remove an entity from the search index. */
  async remove(entityId: string): Promise<void> {
    try {
      await supabase().from('search_index').delete().eq('entity_id', entityId);
    } catch (err) {
      console.warn('[SearchService] remove failed:', err);
    }
  }
}

export const GlobalSearchService = new _GlobalSearchService();
