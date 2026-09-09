import { OcrQuotaExceededError, PulseScanEngine } from "@/features/ocr";
import { parseLrFieldsFromOcrJob } from "@/features/trips/services/lrDocumentOcr.util";
import { updateTripDocumentNumber } from "@/features/trips/services/tripDocuments.service";

export async function extractLrFieldsFromUploadedDocument(input: {
  organizationId: string;
  localUri: string;
  tripId: string;
  tripDocumentId: string;
  storagePath: string;
  createdBy: string;
  /** When set, OCR must not replace the number typed in Confirm upload. */
  existingDocumentNumber?: string | null;
}): Promise<{ lrNumber: string | null; lrDate: string | null }> {
  if (input.tripDocumentId.startsWith("storage-")) {
    return { lrNumber: null, lrDate: null };
  }
  try {
    const job = await PulseScanEngine.enqueueAndProcess({
      scanType: "pod_document",
      organizationId: input.organizationId,
      localUri: input.localUri,
      tripId: input.tripId,
      tripDocumentId: input.tripDocumentId,
      storagePath: input.storagePath,
      createdBy: input.createdBy,
    });
    const fields = parseLrFieldsFromOcrJob(job);
    const existing = input.existingDocumentNumber?.trim() || null;
    if (fields.lrNumber && !existing) {
      await updateTripDocumentNumber(input.tripDocumentId, fields.lrNumber);
    }
    return {
      ...fields,
      lrNumber: existing ?? fields.lrNumber,
    };
  } catch (error) {
    if (error instanceof OcrQuotaExceededError) {
      return { lrNumber: null, lrDate: null };
    }
    throw error;
  }
}
