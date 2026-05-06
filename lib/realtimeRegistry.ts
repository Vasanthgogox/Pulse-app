import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

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
};

const registry = new Map<string, RegistryEntry>();

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
  let channel = supabase().channel(`shared:${key}`);
  for (const spec of specs) {
    channel = channel.on("postgres_changes", spec, (payload) => emitToListeners(key, payload));
  }
  return channel.subscribe();
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
    void supabase().removeChannel(entry.channel).catch(() => {});
  });
  registry.clear();
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
    entry = {
      channel: createSharedChannel(key, specs),
      refs: 0,
      specsSignature: signature,
      listeners: new Set<RealtimeListener>(),
    };
    registry.set(key, entry);
    logRegistryState('OPEN (new channel)', key);
  } else if (entry.specsSignature !== signature) {
    console.warn(
      `[realtime] shared key "${key}" reused with different specs; keeping existing channel`
    );
  } else {
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
      logRegistryState('CLOSE (last ref gone)', key);
      void supabase().removeChannel(current.channel).catch((err: unknown) => {
        console.warn("[realtime] remove shared channel failed:", err);
      });
      registry.delete(key);
    } else {
      logRegistryState('DETACH (refs remaining)', key);
    }
  };
}

