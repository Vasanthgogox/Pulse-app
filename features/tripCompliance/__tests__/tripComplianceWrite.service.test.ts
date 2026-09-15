// See tripComplianceBulkPayment.service.test.ts for why finance.service is mocked here.
jest.mock("@/features/finance/services/finance.service", () => ({
  createLedgerEntry: jest.fn(),
  updateLedgerEntry: jest.fn(),
}));

import { checkCompliancePaymentAllowed } from "@/features/tripCompliance/services/tripComplianceWrite.service";

function mockMakeThenable<T>(result: { data: T; error: null }) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = chain;
  builder.eq = chain;
  builder.in = chain;
  builder.then = (resolve: (v: typeof result) => void) => resolve(result);
  return builder;
}

let mockTxnsResult: { data: unknown[]; error: null };

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: (table: string) => {
      if (table === "transactions") return mockMakeThenable(mockTxnsResult);
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

describe("checkCompliancePaymentAllowed — duplicate payment / already-settled protection", () => {
  beforeEach(() => {
    mockTxnsResult = { data: [], error: null };
  });

  it("allows the first advance payment on a trip with no prior compliance transactions", async () => {
    const result = await checkCompliancePaymentAllowed({ tripId: "trip-1", category: "compliance_advance" });
    expect(result.ok).toBe(true);
  });

  it("rejects a second advance payment on the same trip", async () => {
    mockTxnsResult = {
      data: [{ trip_id: "trip-1", ledger_category: "compliance_advance", description: "Compliance Advance | Mode: UPI" }],
      error: null,
    };
    const result = await checkCompliancePaymentAllowed({ tripId: "trip-1", category: "compliance_advance" });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/already been posted/i);
  });

  it("rejects a balance payment before any advance has been posted", async () => {
    const result = await checkCompliancePaymentAllowed({ tripId: "trip-1", category: "compliance_balance" });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/advance payment must be posted/i);
  });

  it("rejects a second balance payment once the trip is already settled", async () => {
    mockTxnsResult = {
      data: [
        { trip_id: "trip-1", ledger_category: "compliance_advance", description: "Compliance Advance | Mode: UPI" },
        { trip_id: "trip-1", ledger_category: "compliance_balance", description: "Compliance Balance | Mode: UPI" },
      ],
      error: null,
    };
    const result = await checkCompliancePaymentAllowed({ tripId: "trip-1", category: "compliance_balance" });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/already settled/i);
  });

  it("allows a balance payment once an advance exists and no balance has been posted yet", async () => {
    mockTxnsResult = {
      data: [{ trip_id: "trip-1", ledger_category: "compliance_advance", description: "Compliance Advance | Mode: UPI" }],
      error: null,
    };
    const result = await checkCompliancePaymentAllowed({ tripId: "trip-1", category: "compliance_balance" });
    expect(result.ok).toBe(true);
  });
});
