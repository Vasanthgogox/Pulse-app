/** Driver trip guidance — shared by driver dashboard map + route animation hook. */

export type DriverGuidanceStep =
  | "accepted"
  | "pickup"
  | "transit"
  | "reached"
  | "completed";

export type DriverGuidanceConfig = {
  title: string;
  subtitle: string;
  toastMessage: string;
  target: "pickup" | "drop" | null;
  icon: "location-arrow" | "map-marker" | "check-circle";
};
