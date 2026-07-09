import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import { mergeSupplierDisplayFields } from "@/features/suppliers/services/suppliers.service";

function baseSupplier(overrides: Partial<SupplierRow> = {}): SupplierRow {
  return {
    id: "supplier-1",
    organization_id: "org-1",
    name: "Rahoo",
    contact: null,
    company_name: null,
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
    supplier_type: "integrated",
    linked_organization_id: "linked-org-1",
    onboarding_agreement_status: "pending",
    onboarding_agreement_signed_at: null,
    onboarding_agreement_storage_path: null,
    onboarding_agreement_notes: null,
    ...overrides,
  };
}

describe("mergeSupplierDisplayFields", () => {
  it("fills empty local contact fields from enriched integrated supplier details", () => {
    const base = baseSupplier();
    const details = baseSupplier({
      contact_person: "Thameem",
      phone: "+911234567899",
      email: "thameem@gmail.com",
      company_name: "Rahoo",
    });

    const merged = mergeSupplierDisplayFields(base, details);

    expect(merged.contact_person).toBe("Thameem");
    expect(merged.phone).toBe("+911234567899");
    expect(merged.email).toBe("thameem@gmail.com");
    expect(merged.company_name).toBe("Rahoo");
    expect(merged.onboarding_agreement_status).toBe("pending");
    expect(merged.linked_organization_id).toBe("linked-org-1");
  });

  it("keeps local supplier contact fields when already present", () => {
    const base = baseSupplier({
      contact_person: "Local Contact",
      phone: "+910000000001",
      email: "local@example.com",
    });
    const details = baseSupplier({
      contact_person: "Thameem",
      phone: "+911234567899",
      email: "thameem@gmail.com",
    });

    const merged = mergeSupplierDisplayFields(base, details);

    expect(merged.contact_person).toBe("Local Contact");
    expect(merged.phone).toBe("+910000000001");
    expect(merged.email).toBe("local@example.com");
  });

  it("leaves non-integrated offline supplier unchanged when details match local row", () => {
    const base = baseSupplier({
      supplier_type: "offline",
      linked_organization_id: null,
      contact_person: "Offline Owner",
      phone: "+919999999999",
      email: "offline@example.com",
    });
    const details = baseSupplier({
      supplier_type: "offline",
      linked_organization_id: null,
      contact_person: "Offline Owner",
      phone: "+919999999999",
      email: "offline@example.com",
    });

    const merged = mergeSupplierDisplayFields(base, details);

    expect(merged).toEqual(base);
  });
});
