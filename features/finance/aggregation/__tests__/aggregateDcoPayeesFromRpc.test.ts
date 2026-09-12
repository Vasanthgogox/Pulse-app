import { aggregateDcoPayeesFromRpc } from "../aggregateDcoPayeesFromRpc";

describe("aggregateDcoPayeesFromRpc", () => {
  it("identifies the DCO payee as the finance counterparty, not the driver_id", () => {
    const { rows } = aggregateDcoPayeesFromRpc(
      [
        {
          dco_payee_id: "payee-1",
          dco_user_id: "user-1",
          due: 36500,
          paid: 0,
          outstanding: 36500,
          trips_count: 1,
        },
      ],
      new Map([["user-1", { dco_user_id: "user-1", name: "Owner Driver", phone: null }]]),
    );
    expect(rows[0].id).toBe("payee-1");
    expect(rows[0].counterpartyKind).toBe("dco");
    expect(rows[0].subline).toBe("DCO");
    expect(rows[0].payables).toBe(36500);
  });
});
