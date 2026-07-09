import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import { supplierToPublicEntity } from "@/features/public-profile/mappers";

function supplier(overrides: Partial<SupplierRow> = {}): SupplierRow {
  return {
    id: "supplier-1",
    organization_id: "org-1",
    name: "Rahoo",
    contact: null,
    company_name: "Rahoo",
    contact_person: null,
    phone: null,
    email: null,
    address: null,
    gstin: null,
    pan_number: null,
    cin: null,
    msme_number: null,
    tan_number: null,
    iec_number: null,
    is_active: true,
    is_verified: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    supplier_type: "offline",
    linked_organization_id: null,
    ...overrides,
  };
}

describe("supplierToPublicEntity", () => {
  it("includes contact, phone, and email facts for enriched integrated suppliers", () => {
    const entity = supplierToPublicEntity(
      supplier({
        supplier_type: "integrated",
        linked_organization_id: "linked-org-1",
        contact_person: "Thameem",
        phone: "+911234567899",
        email: "thameem@gmail.com",
      }),
    );

    expect(entity.subtitle).toBe("Thameem");
    expect(entity.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Contact", value: "Thameem" }),
        expect.objectContaining({ label: "Contact Channel", value: "•• •• 7899" }),
        expect.objectContaining({ label: "Email", value: "thameem@gmail.com" }),
      ]),
    );
  });

  it("omits contact facts when supplier has no display fields", () => {
    const entity = supplierToPublicEntity(
      supplier({
        supplier_type: "integrated",
        linked_organization_id: "linked-org-1",
      }),
    );

    expect(entity.facts.some((fact) => fact.label === "Email")).toBe(false);
    expect(entity.facts.some((fact) => fact.label === "Contact")).toBe(false);
    expect(entity.facts.some((fact) => fact.label === "Contact Channel")).toBe(false);
  });
});
