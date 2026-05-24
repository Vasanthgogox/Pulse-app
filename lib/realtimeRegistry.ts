import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AppState } from "react-native";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RealtimeListener = (payload: RealtimePostgresChangesPayload<Record<string, any>>) => void;

type PostgresChangeSpec = {
  event: "*" | "INSERT" | "UPDATE" | "DELETE";
  schema: string;
  table: string;
  filter?: string;
};

type RegistryEntry = {
  channel: RealtimeChannel;
  refs: number;
  specsSignature: string;
  listeners: Set<RealtimeListener>;
  openedAt: number;
  lastAttachedAt: number;
  /** Pending teardown timer — cancelled if a new subscriber attaches before it fires. */
  teardownTimer: ReturnType<typeof setTimeout> | null;
};

const registry = new Map<string, RegistryEntry>();
const MAX_SHARED_CHANNELS = 20;
const STALE_SHARED_CHANNEL_MS = 10 * 60 * 1000;
const DEV_DIAGNOSTICS_LOG_INTERVAL_MS = 30 * 1000;
/** Grace period before destroying a channel whose refs hit 0.
 * Prevents websocket churn when React effects unmount/remount on tab switches. */
const TEARDOWN_GRACE_MS = 5_000;

type RealtimeRegistryTelemetry = {
  opens: number;
  closes: number;
  attaches: number;
  detaches: number;
  capBreaches: number;
  staleSweeps: number;
  /** Teardowns cancelled by a reattach within the grace window. */
  graceReattaches: number;
};

const telemetry: RealtimeRegistryTelemetry = {
  opens: 0,
  closes: 0,
  attaches: 0,
  detaches: 0,
  capBreaches: 0,
  staleSweeps: 0,
  graceReattaches: 0,
};
let diagnosticsInterval: ReturnType<typeof setInterval> | null = null;

/** Dev-only: log current active channels to console. */
function logRegistryState(action: string, key: string) {
  if (!__DEV__) return;
  const total = registry.size;
  const lines: string[] = [];
  registry.forEach((e, k) => {
    lines.push(`  [${k}] refs=${e.refs}`);
  });
  console.log(`[realtime] ${action}: "${key}" | total=${total}\n${lines.join('\n')}`);
}

function specsSignature(specs: PostgresChangeSpec[]): string {
  return JSON.stringify(
    specs.map((spec) => ({
      event: spec.event,
      schema: spec.schema,
      table: spec.table,
      filter: spec.filter ?? "",
    }))
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function emitToListeners(key: string, payload: RealtimePostgresChangesPayload<Record<string, any>>) {
  const entry = registry.get(key);
  if (!entry) return;
  for (const listener of entry.listeners) {
    try {
      listener(payload);
    } catch (err) {
      console.warn("[realtime] shared listener failed:", err);
    }
  }
}

function createSharedChannel(key: string, specs: PostgresChangeSpec[]): RealtimeChannel {
  // Use a unique topic per open so Supabase client never reuses an already-subscribed
  // channel object (which rejects new postgres_changes callbacks after subscribe()).
  const topic = `shared:${key}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
  let channel = supabase().channel(topic);
  for (const spec of specs) {
    channel = channel.on("postgres_changes", spec, (payload) => emitToListeners(key, payload));
  }
  return channel.subscribe();
}

function sweepStaleChannels() {
  const now = Date.now();
  let removed = 0;
  registry.forEach((entry, key) => {
    if (entry.refs > 0) return;
    if (now - entry.lastAttachedAt < STALE_SHARED_CHANNEL_MS) return;
    if (entry.teardownTimer) clearTimeout(entry.teardownTimer);
    void supabase().removeChannel(entry.channel).catch(() => {});
    registry.delete(key);
    removed += 1;
  });
  if (removed > 0) {
    telemetry.staleSweeps += removed;
    if (__DEV__) {
      console.log(`[realtime] stale-sweep removed=${removed}`);
    }
  }
}

function enforceChannelCap() {
  sweepStaleChannels();
  if (registry.size < MAX_SHARED_CHANNELS) return;
  telemetry.capBreaches += 1;
  console.warn(
    `[realtime] channel cap reached (${registry.size}/${MAX_SHARED_CHANNELS}); refusing new channel until stale entries clear`
  );
}

export function getRealtimeRegistryDiagnostics() {
  return {
    activeRegistryEntries: registry.size,
    activeSupabaseChannels: supabase().getChannels().length,
    ...telemetry,
  };
}

export function installRealtimeDiagnosticsGlobalHook() {
  if (!__DEV__) return;
  const target = globalThis as typeof globalThis & {
    __REALTIME_DIAGNOSTICS__?: () => ReturnType<typeof getRealtimeRegistryDiagnostics>;
  };
  target.__REALTIME_DIAGNOSTICS__ = getRealtimeRegistryDiagnostics;
}

export function startRealtimeDiagnosticsLogger() {
  if (!__DEV__ || diagnosticsInterval) return;
  diagnosticsInterval = setInterval(() => {
    const diagnostics = getRealtimeRegistryDiagnostics();
    console.log("[realtime:diag]", JSON.stringify(diagnostics));
  }, DEV_DIAGNOSTICS_LOG_INTERVAL_MS);
}

export function stopRealtimeDiagnosticsLogger() {
  if (!diagnosticsInterval) return;
  clearInterval(diagnosticsInterval);
  diagnosticsInterval = null;
}

/**
 * Emergency teardown: closes every open channel immediately.
 * Call on explicit sign-out as a belt-and-suspenders safety net.
 * React's useEffect cleanup handles the normal case; this handles edge cases
 * where components don't unmount fast enough (e.g. browser unload, force sign-out).
 */
export function clearAllRealtimeChannels() {
  if (__DEV__) console.log(`[realtime] TEARDOWN: closing ${registry.size} channels`);
  registry.forEach((entry) => {
    if (entry.teardownTimer) clearTimeout(entry.teardownTimer);
    void supabase().removeChannel(entry.channel).catch(() => {});
  });
  registry.clear();
}

/**
 * Force-prune channels with refs=0 that have been idle beyond the stale threshold.
 * Called automatically on app foreground to prevent server-side subscription accumulation
 * when clients disconnect without clean unsubscribe (e.g. backgrounded, network drop).
 */
export function pruneStaleChannels() {
  let removed = 0;
  registry.forEach((entry, key) => {
    if (entry.refs > 0) return;
    if (entry.teardownTimer) clearTimeout(entry.teardownTimer);
    void supabase().removeChannel(entry.channel).catch(() => {});
    registry.delete(key);
    removed += 1;
  });
  if (removed > 0) {
    telemetry.staleSweeps += removed;
    if (__DEV__) console.log(`[realtime] foreground-prune removed=${removed} | remaining=${registry.size}`);
  }
}

let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

/** Call once at app init to auto-prune stale channels when app returns to foreground. */
export function installForegroundPruning() {
  if (appStateSubscription) return;
  appStateSubscription = AppState.addEventListener("change", (state) => {
    if (state === "active") {
      pruneStaleChannels();
    }
  });
}

/**
 * Ref-counted shared realtime channel by key.
 * Guarantees one channel per key globally and fan-outs events to all listeners.
 */
export function subscribeSharedPostgresChanges(
  key: string,
  specs: PostgresChangeSpec[],
  listener: RealtimeListener
): () => void {
  const signature = specsSignature(specs);
  let entry = registry.get(key);

  if (!entry) {
    enforceChannelCap();
    if (registry.size >= MAX_SHARED_CHANNELS) {
      console.warn(`[realtimeRegistry] channel cap (${MAX_SHARED_CHANNELS}) reached — subscription for key "${key}" was not registered`);
      return () => {};
    }
    const now = Date.now();
    entry = {
      channel: createSharedChannel(key, specs),
      refs: 0,
      specsSignature: signature,
      listeners: new Set<RealtimeListener>(),
      openedAt: now,
      lastAttachedAt: now,
      teardownTimer: null,
    };
    registry.set(key, entry);
    telemetry.opens += 1;
    logRegistryState('OPEN (new channel)', key);
  } else if (entry.specsSignature !== signature) {
    console.warn(
      `[realtime] shared key "${key}" reused with different specs; keeping existing channel`
    );
  } else {
    if (entry.teardownTimer) {
      clearTimeout(entry.teardownTimer);
      entry.teardownTimer = null;
      telemetry.graceReattaches += 1;
      logRegistryState('REATTACH (teardown cancelled)', key);
    }
    entry.lastAttachedAt = Date.now();
    telemetry.attaches += 1;
    logRegistryState('ATTACH (shared channel)', key);
  }

  entry.refs += 1;
  entry.listeners.add(listener);

  return () => {
    const current = registry.get(key);
    if (!current) return;
    current.listeners.delete(listener);
    current.refs = Math.max(0, current.refs - 1);
    if (current.refs === 0) {
      logRegistryState('GRACE (last ref gone, scheduling teardown)', key);
      if (current.teardownTimer) clearTimeout(current.teardownTimer);
      current.teardownTimer = setTimeout(() => {
        const entry = registry.get(key);
        if (!entry || entry.refs > 0) return;
        telemetry.closes += 1;
        logRegistryState('CLOSE (grace expired)', key);
        void supabase().removeChannel(entry.channel).catch((err: unknown) => {
          console.warn("[realtime] remove shared channel failed:", err);
        });
        registry.delete(key);
      }, TEARDOWN_GRACE_MS);
    } else {
      telemetry.detaches += 1;
      logRegistryState('DETACH (refs remaining)', key);
    }
  };
}

// ─── Production health export ─────────────────────────────────────────────────

export type RealtimeSyncStatus = 'live' | 'degraded' | 'offline';

export interface RealtimeHealth {
  status: RealtimeSyncStatus;
  activeChannels: number;
  /** Channels open longer than 10 min (stale candidates). */
  staleChannelCount: number;
  capUtilizationPct: number;
}

/**
 * Returns a lightweight health snapshot — safe to call in production.
 * status='live'     → channels open, no cap breach in last window
 * status='degraded' → cap was hit or channels are stale
 * status='offline'  → no active channels (likely network loss)
 */
export function getRealtimeHealth(): RealtimeHealth {
  const active = registry.size;
  let stale = 0;
  const now = Date.now();
  registry.forEach((e) => {
    if (now - e.openedAt > STALE_SHARED_CHANNEL_MS) stale++;
  });
  let status: RealtimeSyncStatus = 'live';
  if (active === 0) status = 'offline';
  else if (telemetry.capBreaches > 0 || stale > 0) status = 'degraded';
  return {
    status,
    activeChannels: active,
    staleChannelCount: stale,
    capUtilizationPct: Math.round((active / MAX_SHARED_CHANNELS) * 100),
  };
}

