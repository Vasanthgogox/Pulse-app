import type { IndentRow } from "@/features/indents/services/indents.service";
import { getTodayIso, isValidIsoDateString } from "@/lib/dateIso.util";

/** Indent `weight` is stored in kg; deploy UI uses metric tons. */
export function indentWeightKgToTonsInput(kg: number | null | undefined): string {
  const n = Number(kg);
  if (!Number.isFinite(n) || n <= 0) return "";
  const tons = n / 1000;
  if (tons >= 100) return tons.toFixed(1);
  const rounded = Math.round(tons * 100) / 100;
  return String(rounded);
}

export function parseTonsInputToWeightKg(tonsInput: string): number | null {
  const raw = tonsInput.trim().replace(/,/g, "");
  if (!raw) return null;
  const tons = parseFloat(raw);
  if (!Number.isFinite(tons) || tons <= 0 || tons > 999) return null;
  const kg = tons * 1000;
  if (kg > 999_999) return null;
  return kg;
}

export function seedDeployPickupDateFromIndent(indent: IndentRow): string {
  const raw = indent.pickup_date;
  if (raw != null && String(raw).trim()) {
    const s = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
  }
  return getTodayIso();
}

export function seedDeployWeightTonsFromIndent(indent: IndentRow): string {
  return indentWeightKgToTonsInput(indent.weight);
}

export function isDeployTripDetailsReady(
  pickupDate: string,
  weightTons: string,
  vehicleType: string,
  loadType: string,
): boolean {
  return (
    isValidIsoDateString(pickupDate) &&
    parseTonsInputToWeightKg(weightTons) != null &&
    vehicleType.trim().length > 0 &&
    loadType.trim().length > 0
  );
}

export function seedDeployVehicleTypeFromIndent(indent: {
  vehicle_type?: string | null;
}): string {
  return (indent.vehicle_type ?? "").trim();
}

export function seedDeployLoadTypeFromIndent(indent: {
  load_type?: string | null;
}): string {
  return (indent.load_type ?? "").trim();
}
