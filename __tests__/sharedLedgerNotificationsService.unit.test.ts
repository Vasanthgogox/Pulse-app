import {
  getSharedLedgerNotifications,
  getSharedLedgerNotificationsCount,
} from "@/services/sharedLedgerNotificationsService";

const mockSupabaseFactory = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => mockSupabaseFactory(),
}));

jest.mock("@/features/clients/services/clients.service", () => ({
  getClientsByOrganization: jest.fn(async () => ({ error: null, clients: [] })),
}));

jest.mock("@/features/suppliers/services/suppliers.service", () => ({
  getSuppliersByOrganization: jest.fn(async () => ({ error: null, suppliers: [] })),
}));

jest.mock("@/features/finance/services/finance.service", () => ({
  getTransactionsByOrganization: jest.fn(async () => ({
    error: null,
    transactions: [],
  })),
}));

jest.mock("@/services/sharedLedgerService", () => ({
  getDisputesForPartner: jest.fn(async () => ({ error: null, disputes: [] })),
  getDisputesReceived: jest.fn(async () => ({ error: null, disputes: [] })),
  getSharedLedgerEntriesForPartner: jest.fn(async () => ({
    error: null,
    entries: [],
  })),
}));

function makeFromSelectChain(result: {
  data?: unknown;
  error?: { message: string } | null;
  count?: number | null;
}) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve(result)),
        order: jest.fn(() => Promise.resolve(result)),
        in: jest.fn(() => Promise.resolve(result)),
      })),
      order: jest.fn(() => Promise.resolve(result)),
    })),
  };
}

describe("sharedLedgerNotificationsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("maps rpc notifications when backend function exists", async () => {
    mockSupabaseFactory.mockReturnValue({
      rpc: jest.fn().mockResolvedValue({
        data: [
          {
            id: "n1",
            organization_id: "org-1",
            event_type: "dispute_received",
            status: "open",
            title: "Partner raised dispute",
            payload_json: { trip_id: "trip-1" },
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
        error: null,
      }),
      from: jest.fn(),
    });

    const res = await getSharedLedgerNotifications("org-1");
    expect(res.error).toBeNull();
    expect(res.notifications).toHaveLength(1);
    expect(res.notifications[0]?.id).toBe("n1");
    expect(res.notifications[0]?.event_type).toBe("dispute_received");
  });

  it("fails soft when rpc and table are unavailable", async () => {
    const from = jest.fn().mockReturnValue({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          order: jest.fn(() =>
            Promise.resolve({
              data: null,
              error: {
                message:
                  "relation \"public.shared_ledger_notifications\" does not exist",
              },
            }),
          ),
        })),
      })),
    });

    mockSupabaseFactory.mockReturnValue({
      rpc: jest.fn().mockResolvedValue({
        data: null,
        error: {
          message:
            "Could not find the function public.get_shared_ledger_notifications in the schema cache",
        },
      }),
      from,
    });

    const res = await getSharedLedgerNotifications("org-1");
    expect(res.error).toBeNull();
    expect(res.unavailable).toBe(true);
    expect(res.notifications).toEqual([]);
  });

  it("returns aggregate actionable count from rpc", async () => {
    mockSupabaseFactory.mockReturnValue({
      rpc: jest.fn().mockResolvedValue({
        data: [{ actionable_count: 3 }],
        error: null,
      }),
      from: jest.fn(),
    });

    const res = await getSharedLedgerNotificationsCount("org-1");
    expect(res.error).toBeNull();
    expect(res.count.actionableCount).toBe(3);
  });

  it("falls back to table count when rpc missing", async () => {
    const headResult = { count: 7, error: null };
    const chain = makeFromSelectChain(headResult);
    mockSupabaseFactory.mockReturnValue({
      rpc: jest.fn().mockResolvedValue({
        data: null,
        error: {
          message:
            "Could not find the function public.get_shared_ledger_notifications_count in the schema cache",
        },
      }),
      from: jest.fn(() => chain),
    });

    const res = await getSharedLedgerNotificationsCount("org-1");
    expect(res.error).toBeNull();
    expect(res.count.actionableCount).toBe(7);
  });
});
