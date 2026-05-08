const inflight = new Map<string, Promise<unknown>>();

export async function runSingleflight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const current = inflight.get(key) as Promise<T> | undefined;
  if (current) return current;
  const next = fn().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, next);
  return next;
}
