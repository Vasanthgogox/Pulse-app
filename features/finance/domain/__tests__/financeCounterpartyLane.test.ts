import {
  financePartyLaneForContactType,
  isDriverLedgerContactType,
  isDcoLedgerContactType,
  isEmployeeDriverLedgerPayment,
  isSupplierFinanceLaneContactType,
} from "../financeCounterpartyLane";

describe("financeCounterpartyLane", () => {
  it("keeps contact_type dco as internal identity on the Supplier lane", () => {
    expect(isDcoLedgerContactType("dco")).toBe(true);
    expect(isSupplierFinanceLaneContactType("dco")).toBe(true);
    expect(financePartyLaneForContactType("dco")).toBe("suppliers");
    expect(isDriverLedgerContactType("dco")).toBe(false);
  });

  it("does not treat a DCO row as a Driver payable even if a driver_id exists elsewhere", () => {
    expect(financePartyLaneForContactType("dco")).not.toBe("drivers");
    expect(isSupplierFinanceLaneContactType("driver")).toBe(false);
    expect(financePartyLaneForContactType("driver")).toBe("drivers");
    expect(
      isEmployeeDriverLedgerPayment({
        contact_type: "dco",
        driver_name: "Owner Driver",
      }),
    ).toBe(false);
  });

  it("leaves normal supplier and client lanes unchanged", () => {
    expect(isSupplierFinanceLaneContactType("supplier")).toBe(true);
    expect(financePartyLaneForContactType("supplier")).toBe("suppliers");
    expect(financePartyLaneForContactType("client")).toBe("customers");
  });
});
