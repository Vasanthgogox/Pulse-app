import {
  mapSupplierVerificationVaultDocs,
  resolveSupplierVaultDocType,
} from "@/features/suppliers/utils/supplierVerificationVault.util";
import type { SupplierKycDocument } from "@/features/suppliers/types/supplierManagement.types";

function doc(
  partial: Partial<SupplierKycDocument> & Pick<SupplierKycDocument, "id" | "doc_type">,
): SupplierKycDocument {
  return {
    status: "pending",
    version_number: 1,
    ...partial,
  };
}

describe("supplier verification vault", () => {
  it("always returns GST, PAN, and bank proof slots", () => {
    const slots = mapSupplierVerificationVaultDocs([]);
    expect(slots.map((s) => s.documentType)).toEqual([
      "GST REGISTRATION",
      "PAN IDENTITY",
      "BANK PROOF",
    ]);
    expect(slots.every((s) => s.status === "Pending")).toBe(true);
    expect(slots.every((s) => !s.storagePath)).toBe(true);
  });

  it("fills a slot from the latest matching KYC row", () => {
    const slots = mapSupplierVerificationVaultDocs([
      doc({
        id: "gst-old",
        doc_type: "gstin",
        version_number: 1,
        storage_path: "old.pdf",
      }),
      doc({
        id: "gst-new",
        doc_type: "gstin",
        version_number: 2,
        status: "verified",
        storage_path: "new.pdf",
        file_name: "gst.pdf",
        updated_at: "2026-09-01T10:00:00.000Z",
      }),
    ]);
    expect(slots[0]?.id).toBe("gst-new");
    expect(slots[0]?.status).toBe("Verified");
    expect(slots[0]?.storagePath).toBe("new.pdf");
    expect(slots[0]?.dateLabel).not.toBe("—");
    expect(slots[1]?.documentType).toBe("PAN IDENTITY");
    expect(slots[2]?.documentType).toBe("BANK PROOF");
  });

  it("resolves vault labels when docType is missing", () => {
    expect(resolveSupplierVaultDocType({ documentType: "GST REGISTRATION" })).toBe("gstin");
    expect(resolveSupplierVaultDocType({ documentType: "PAN IDENTITY" })).toBe("pan");
    expect(resolveSupplierVaultDocType({ documentType: "BANK PROOF" })).toBe("cancelled_cheque");
    expect(resolveSupplierVaultDocType({ docType: "pan", documentType: "x" })).toBe("pan");
  });
});
