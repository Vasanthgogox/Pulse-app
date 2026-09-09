import {
  formatVaultDocDate,
  type TripDocItem,
} from "@/features/trips/components/trip-detail/tripDocTypes";

export const EWAY_BILL_FIELDS_FILE_NAME = "eway-fields.json";

export type EwayFieldValues = {
  ewayNo: string;
  validTill: string;
  docNo: string;
};

export type EwayBillStripRow = {
  id: string;
  ewayNo: string;
  validTill: string;
  docNo: string;
  canView: boolean;
};

export const EMPTY_EWAY_FIELD_VALUES: EwayFieldValues = {
  ewayNo: "",
  validTill: "",
  docNo: "",
};

const EMPTY_STRIP_ROW: EwayBillStripRow = {
  id: "eway-empty",
  ewayNo: "—",
  validTill: "—",
  docNo: "—",
  canView: false,
};

export function ewayBillFieldsStoragePath(tripId: string): string {
  return `${tripId}/eway_bill/fields.json`;
}

export function isEwayBillMetaPath(
  storagePath?: string | null,
  fileName?: string | null,
): boolean {
  const path = (storagePath ?? "").toLowerCase().split("?")[0];
  const name = (fileName ?? "").toLowerCase();
  return (
    path.endsWith("/fields.json") ||
    path.endsWith("eway-fields.json") ||
    name === EWAY_BILL_FIELDS_FILE_NAME
  );
}

export function parseEwayFieldValues(raw?: string | null): EwayFieldValues {
  if (!raw?.trim()) return { ...EMPTY_EWAY_FIELD_VALUES };
  const text = raw.trim();
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return {
          ewayNo: String(parsed.ewayNo ?? parsed.n ?? "").trim(),
          validTill: String(parsed.validTill ?? parsed.v ?? "").trim(),
          docNo: String(parsed.docNo ?? parsed.d ?? "").trim(),
        };
      }
    } catch {
      return { ...EMPTY_EWAY_FIELD_VALUES, ewayNo: text };
    }
  }
  return { ...EMPTY_EWAY_FIELD_VALUES, ewayNo: text };
}

export function serializeEwayFieldValues(values: EwayFieldValues): string {
  return JSON.stringify({
    ewayNo: values.ewayNo.trim(),
    validTill: values.validTill.trim(),
    docNo: values.docNo.trim(),
  });
}

function dash(value?: string | null): string {
  const text = value?.trim();
  return text ? text : "—";
}

function isUploadedDoc(doc?: TripDocItem | null): boolean {
  return !!doc && (doc.status !== "Pending" || !!doc.storagePath);
}

export function ewayDocHasPreviewableFile(doc?: TripDocItem | null): boolean {
  if (!doc) return false;
  const paths = [
    doc.storagePath,
    ...(doc.files ?? []).map((file) => file.storagePath),
  ].filter((path): path is string => !!path?.trim());
  return paths.some((path) => !isEwayBillMetaPath(path));
}

export function buildEwayBillStripRows(params: {
  ewayDoc?: TripDocItem | null;
  lrDoc?: TripDocItem | null;
  lrNumber?: string | null;
}): EwayBillStripRow[] {
  const fields = parseEwayFieldValues(params.ewayDoc?.documentNumber);
  const docNo = dash(
    fields.docNo || params.lrNumber || params.lrDoc?.documentNumber,
  );
  const validTill = dash(
    formatVaultDocDate(fields.validTill) || fields.validTill,
  );
  const lrUploaded = isUploadedDoc(params.lrDoc);
  const ewayDoc = params.ewayDoc;
  const files = (ewayDoc?.files ?? []).filter(
    (file) =>
      !!file.storagePath?.trim() && !isEwayBillMetaPath(file.storagePath),
  );
  const slotPreviewable =
    ewayDocHasPreviewableFile(ewayDoc) &&
    !!ewayDoc?.storagePath &&
    !isEwayBillMetaPath(ewayDoc.storagePath);

  if (files.length === 0) {
    return [
      {
        id: ewayDoc?.documentId ?? ewayDoc?.id ?? EMPTY_STRIP_ROW.id,
        ewayNo: dash(fields.ewayNo),
        validTill,
        docNo,
        canView: slotPreviewable || lrUploaded,
      },
    ];
  }

  return files.map((file, index) => {
    const fromLabel = file.label.includes("·")
      ? parseEwayFieldValues(file.label.split("·").pop()?.trim()).ewayNo
      : "";
    const ewayNo =
      (index === 0 ? fields.ewayNo : "") || fromLabel;
    return {
      id: file.id,
      ewayNo: dash(ewayNo),
      validTill,
      docNo,
      canView: true,
    };
  });
}
