import {
  driverOperatedLogPodTrips,
  filterLogPodTripsForTab,
  supplierOperatedLogPodTrips,
} from "../logPodsListFilter.util";

describe("log incoming POD supplier + tab filters", () => {
  const pending = {
    internal_id: "t1",
    supplier_id: "sup-1",
    supplier_name: "Aero",
    hardCopyReceived: false,
  };
  const received = {
    internal_id: "t2",
    supplier_id: "sup-1",
    supplier_name: "Aero",
    hardCopyReceived: true,
  };
  const otherSupplier = {
    internal_id: "t3",
    supplier_id: "sup-2",
    supplier_name: "Apple",
    hardCopyReceived: false,
  };

  it("lists only trips operated by the selected supplier", () => {
    const listed = supplierOperatedLogPodTrips(
      [pending, received, otherSupplier],
      { id: "sup-1", name: "Aero" },
    );
    expect(listed.map((t) => t.internal_id)).toEqual(["t1", "t2"]);
  });

  it("Pending tab hides hard-copy received trips", () => {
    const listed = filterLogPodTripsForTab([pending, received], "pending");
    expect(listed.map((t) => t.internal_id)).toEqual(["t1"]);
  });

  it("All tab keeps pending and received", () => {
    const listed = filterLogPodTripsForTab([pending, received], "all");
    expect(listed.map((t) => t.internal_id)).toEqual(["t1", "t2"]);
  });

  it("Completed tab keeps delivered trips", () => {
    const listed = filterLogPodTripsForTab(
      [
        { ...pending, status: "in_transit" },
        { ...received, status: "delivered" },
      ],
      "completed",
    );
    expect(listed.map((t) => t.internal_id)).toEqual(["t2"]);
  });

  it("Not completed tab keeps trips that are not delivered", () => {
    const listed = filterLogPodTripsForTab(
      [
        { ...pending, status: "in_transit" },
        { ...received, status: "delivered" },
      ],
      "not_completed",
    );
    expect(listed.map((t) => t.internal_id)).toEqual(["t1"]);
  });

  it("lists only trips operated by the selected driver", () => {
    const listed = driverOperatedLogPodTrips(
      [
        {
          internal_id: "t1",
          driver_id: "d-1",
          driver_name: "Ravi",
        },
        {
          internal_id: "t2",
          driver_id: "d-2",
          driver_name: "Aman",
        },
      ],
      { id: "d-1", name: "Ravi" },
    );
    expect(listed.map((t) => t.internal_id)).toEqual(["t1"]);
  });
});
