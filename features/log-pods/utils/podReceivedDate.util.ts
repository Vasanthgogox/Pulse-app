export type PodReceivedDatePreset = "today" | "yesterday";

export function calendarDateAtNoon(
  preset: PodReceivedDatePreset,
  now: Date = new Date(),
): Date {
  const next = new Date(now);
  next.setHours(12, 0, 0, 0);
  if (preset === "yesterday") next.setDate(next.getDate() - 1);
  return next;
}

export function podReceivedAtIso(
  preset: PodReceivedDatePreset,
  now: Date = new Date(),
): string {
  return calendarDateAtNoon(preset, now).toISOString();
}

export function formatPodReceivedDateLabel(
  preset: PodReceivedDatePreset,
  now: Date = new Date(),
): string {
  return calendarDateAtNoon(preset, now).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
