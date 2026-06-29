export type TripAuditLogCategory = "payment" | "trip" | "assignment" | "status";

export type TripAuditFilterTab = "all" | "trip" | "assignment" | "payment";

export type TripAuditLogEntry = {
  id: string;
  at: string;
  category: TripAuditLogCategory;
  categoryLabel: string;
  title: string;
  recordedAtLabel: string;
  recordedBy: string;
  detail: string;
  detailLines?: string[];
  amountLabel?: string;
};
