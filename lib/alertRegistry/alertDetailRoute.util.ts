import type { RegistryFeedKind } from "@/lib/globalSync/registryFeed.util";

export type AlertDetailMode = "active" | "archive";

export function alertDetailRoute(
  kind: RegistryFeedKind,
  id: string,
  mode: AlertDetailMode = "active",
): `/alert-detail?${string}` {
  const q = new URLSearchParams({
    kind,
    alertId: id,
    mode,
  });
  return `/alert-detail?${q.toString()}` as `/alert-detail?${string}`;
}

export function parseAlertDetailParams(raw: {
  kind?: string | string[];
  id?: string | string[];
  alertId?: string | string[];
  mode?: string | string[];
}): {
  kind: RegistryFeedKind | null;
  id: string;
  mode: AlertDetailMode;
} {
  const kindRaw = typeof raw.kind === "string" ? raw.kind : raw.kind?.[0];
  // Prefer alertId — legacy bookmarks used `id`, which conflicts with `/trip/[id]` path params.
  const id =
    (typeof raw.alertId === "string" ? raw.alertId : raw.alertId?.[0]) ||
    (typeof raw.id === "string" ? raw.id : raw.id?.[0]) ||
    "";
  const modeRaw = typeof raw.mode === "string" ? raw.mode : raw.mode?.[0];
  const kind: RegistryFeedKind | null =
    kindRaw === "salary" || kindRaw === "shared" || kindRaw === "ops"
      ? kindRaw
      : null;
  const mode: AlertDetailMode = modeRaw === "archive" ? "archive" : "active";
  return { kind, id, mode };
}
