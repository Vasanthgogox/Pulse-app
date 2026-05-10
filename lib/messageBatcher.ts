/**
 * MessageBatcher — generic coalescing queue for rapid write operations.
 *
 * Problem: a user who types quickly fires one INSERT per message. Five messages
 * in 500ms becomes five round-trips, five Realtime broadcast events, five
 * pg_stat_activity rows. Under load this creates the "jagged spike" pattern
 * visible in Supabase Dashboard's PostgREST CPU graph.
 *
 * Solution: buffer items for up to `maxWaitMs` OR until `maxItems` accumulates,
 * then flush as a single batched operation. The caller decides what "flush" means
 * (INSERT array, bulk update, etc.).
 *
 * Usage:
 *   const batcher = createMessageBatcher<NewMessage>({
 *     maxWaitMs: 200,
 *     maxItems: 10,
 *     onFlush: async (items) => {
 *       await supabase().from('trip_messages').insert(items);
 *     },
 *   });
 *
 *   // On each user send:
 *   batcher.add(message);
 *
 *   // On component unmount:
 *   await batcher.flushAndDestroy();
 */

export interface MessageBatcherOptions<T> {
  /** Flush when this many items accumulate, even before maxWaitMs. Default: 20. */
  maxItems?: number;
  /** Flush after this many ms since the first item in the batch. Default: 200. */
  maxWaitMs?: number;
  /** Called with the accumulated batch. Must be idempotent (can be called with 1 or N items). */
  onFlush: (items: T[]) => Promise<void>;
  /** Called when onFlush throws. Default: console.error. */
  onError?: (err: unknown, items: T[]) => void;
}

export interface MessageBatcher<T> {
  /** Add an item to the batch. Starts the flush timer if not already running. */
  add: (item: T) => void;
  /** Immediately flush whatever is queued, then stop accepting new items. Call on unmount. */
  flushAndDestroy: () => Promise<void>;
  /** Flush immediately without destroying the batcher. */
  flush: () => Promise<void>;
  /** How many items are currently queued (unflushed). */
  readonly pending: number;
}

export function createMessageBatcher<T>(
  options: MessageBatcherOptions<T>
): MessageBatcher<T> {
  const { maxItems = 20, maxWaitMs = 200, onFlush, onError } = options;

  let queue: T[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  async function doFlush() {
    clearTimer();
    if (queue.length === 0) return;
    const batch = queue.splice(0, queue.length);
    try {
      await onFlush(batch);
    } catch (err) {
      if (onError) {
        onError(err, batch);
      } else {
        console.error('[MessageBatcher] flush error:', err);
      }
    }
  }

  function scheduleFlush() {
    if (timer !== null) return;
    timer = setTimeout(() => {
      void doFlush();
    }, maxWaitMs);
  }

  return {
    add(item: T) {
      if (destroyed) return;
      queue.push(item);
      if (queue.length >= maxItems) {
        void doFlush();
      } else {
        scheduleFlush();
      }
    },

    async flush() {
      await doFlush();
    },

    async flushAndDestroy() {
      destroyed = true;
      await doFlush();
    },

    get pending() {
      return queue.length;
    },
  };
}
