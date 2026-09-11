import { issuedInvoicesForPodToggle } from "../invoicePodRequired.util";

describe("issued invoice list vs POD Required", () => {
  const invoices = [
    { id: "1", invoice_number: "INV/2026-27/00001" },
    { id: "2", invoice_number: "INV/2026-27/00002" },
  ];

  it("POD ON does not hide issued invoices", () => {
    expect(issuedInvoicesForPodToggle(invoices, true)).toEqual(invoices);
  });

  it("POD OFF does not hide issued invoices", () => {
    expect(issuedInvoicesForPodToggle(invoices, false)).toEqual(invoices);
  });

  it("toggle ON → OFF leaves issued invoices unchanged", () => {
    const on = issuedInvoicesForPodToggle(invoices, true);
    const off = issuedInvoicesForPodToggle(invoices, false);
    expect(off).toEqual(on);
  });

  it("toggle OFF → ON leaves issued invoices unchanged", () => {
    const off = issuedInvoicesForPodToggle(invoices, false);
    const on = issuedInvoicesForPodToggle(invoices, true);
    expect(on).toEqual(off);
  });
});
