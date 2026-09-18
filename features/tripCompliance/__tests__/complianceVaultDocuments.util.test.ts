import { vehicleVaultDocumentsToEntityDocs, mergeComplianceEntityDocs } from "@/features/tripCompliance/utils/complianceVaultDocuments.util";
import type { ComplianceEntityDocument } from "@/features/tripCompliance/tripCompliance.types";
import type { VehicleDocuments } from "@/features/vehicles/utils/vehicleDocuments.util";

describe("vehicleVaultDocumentsToEntityDocs", () => {
  it("maps Asset Vault RC/insurance/FC/PUC files onto compliance vehicle slots", () => {
    const documents: VehicleDocuments = {
      rc: { url: "org/v1/rc.pdf", expiryDate: "2027-01-01", uploadedAt: "2026-09-01" },
      insurance: { url: "org/v1/insurance.pdf", expiryDate: "2027-01-01" },
      extras: [{ id: "e1", url: "org/v1/extras/e1.pdf", expiryDate: "2027-01-01", fileName: "national-permit.pdf" }],
    };
    const rows = vehicleVaultDocumentsToEntityDocs("v1", documents);
    expect(rows.map((row) => row.doc_type).sort()).toEqual(["insurance", "permit", "rc"]);
    expect(rows.every((row) => row.source === "vehicle-vault")).toBe(true);
    expect(rows.find((row) => row.doc_type === "rc")?.storage_path).toBe("org/v1/rc.pdf");
  });

  it("returns nothing when the vault JSON is empty", () => {
    expect(vehicleVaultDocumentsToEntityDocs("v1", {})).toEqual([]);
    expect(vehicleVaultDocumentsToEntityDocs("v1", null)).toEqual([]);
  });
});

describe("mergeComplianceEntityDocs", () => {
  it("lets vault files win over entity_documents of the same type", () => {
    const vault: ComplianceEntityDocument[] = [
      {
        id: "vault-rc",
        entity_type: "vehicle",
        entity_id: "v1",
        doc_type: "rc",
        status: "active",
        storage_path: "vault/rc.pdf",
        expiry_date: null,
        verified_at: null,
        notes: null,
        created_at: "2026-09-01",
        source: "vehicle-vault",
      },
    ];
    const entity: ComplianceEntityDocument[] = [
      {
        id: "entity-rc",
        entity_type: "vehicle",
        entity_id: "v1",
        doc_type: "rc",
        status: "pending",
        storage_path: "entity/rc.pdf",
        expiry_date: null,
        verified_at: null,
        notes: null,
        created_at: "2026-01-01",
        source: "entity",
      },
    ];
    expect(mergeComplianceEntityDocs(vault, entity)[0]?.id).toBe("vault-rc");
  });
});
