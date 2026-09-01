import { createSharedIndentCopiesWithOps } from "@/features/indents/utils/indentShareCopies.util";
import { INDENT_VEHICLE_COUNT_ERROR } from "@/features/indents/utils/indentVehicleCount.util";

type Copy = {
  id: string;
  indent_number: string;
  pickup_area: string;
  drop_location: string;
  client_id: string;
  client_name: string;
  vehicle_type: string;
  load_type: string;
  weight: number;
  client_price: number;
  supplier_target: number;
  pickup_date: string;
};

const PAYLOAD = {
  pickup_area: "Mumbai",
  drop_location: "Pune",
  client_id: "client-1",
  client_name: "Acme",
  vehicle_type: "Taurus",
  load_type: "Steel",
  weight: 16000,
  client_price: 40000,
  supplier_target: 35000,
  pickup_date: "2026-09-01",
};

const DRAFT_UUID = "11111111-1111-4111-8111-111111111111";

function matchingCopy(index: number): Copy {
  return {
    id: `id-${index}`,
    indent_number: `IND-${String(index).padStart(3, "0")}`,
    ...PAYLOAD,
  };
}

function makeOps(options?: {
  failCreateAt?: number;
  failCancelIds?: string[];
}) {
  const created: Copy[] = [];
  const cancelled: string[] = [];
  let createCalls = 0;
  const ops = {
    createIndent: jest.fn(async () => {
      createCalls += 1;
      if (options?.failCreateAt === createCalls) {
        return { error: new Error(`fail on copy ${createCalls}`), indent: null };
      }
      const row = matchingCopy(createCalls);
      created.push(row);
      return { error: null, indent: row };
    }),
    updateIndentDraft: jest.fn(async () => ({ error: null, indent: matchingCopy(1) })),
    shareDraftIndent: jest.fn(async () => {
      const row = matchingCopy(1);
      created.push(row);
      return { error: null, indent: row };
    }),
    cancelIndent: jest.fn(async (id: string) => {
      cancelled.push(id);
      if (options?.failCancelIds?.includes(id)) {
        return { error: new Error(`cancel failed ${id}`) };
      }
      return { error: null };
    }),
  };
  return { ops, created, cancelled, getCreateCalls: () => createCalls };
}

describe("createSharedIndentCopiesWithOps", () => {
  it.each([1, 2, 5, 10, 50])(
    "creates exactly %s matching indents with unique numbers",
    async (count) => {
      const { ops } = makeOps();
      const result = await createSharedIndentCopiesWithOps(
        ops,
        "org-1",
        PAYLOAD,
        count,
      );
      expect(result.error).toBeNull();
      expect(result.indents).toHaveLength(count);
      expect(ops.createIndent).toHaveBeenCalledTimes(count);
      for (const indent of result.indents) {
        expect(indent.pickup_area).toBe(PAYLOAD.pickup_area);
        expect(indent.drop_location).toBe(PAYLOAD.drop_location);
        expect(indent.client_id).toBe(PAYLOAD.client_id);
        expect(indent.client_name).toBe(PAYLOAD.client_name);
        expect(indent.vehicle_type).toBe(PAYLOAD.vehicle_type);
        expect(indent.load_type).toBe(PAYLOAD.load_type);
        expect(indent.weight).toBe(PAYLOAD.weight);
        expect(indent.client_price).toBe(PAYLOAD.client_price);
        expect(indent.supplier_target).toBe(PAYLOAD.supplier_target);
        expect(indent.pickup_date).toBe(PAYLOAD.pickup_date);
      }
      const numbers = result.indents.map((row) => row.indent_number);
      expect(new Set(numbers).size).toBe(count);
      expect(ops.createIndent.mock.calls.every((call) => call[1] === PAYLOAD)).toBe(
        true,
      );
    },
  );

  it("rejects invalid counts instead of clamping", async () => {
    const { ops } = makeOps();
    for (const count of [0, -1, 1.5, 51, NaN]) {
      const result = await createSharedIndentCopiesWithOps(
        ops,
        "org-1",
        PAYLOAD,
        count,
      );
      expect(result.error?.message).toBe(INDENT_VEHICLE_COUNT_ERROR);
      expect(result.indents).toEqual([]);
      expect(ops.createIndent).not.toHaveBeenCalled();
    }
  });

  it.each([
    [2, 2],
    [3, 5],
    [5, 5],
  ])(
    "rolls back when copy %s of a %s-indent share fails",
    async (failAt, count) => {
      const { ops, cancelled } = makeOps({ failCreateAt: failAt });
      const result = await createSharedIndentCopiesWithOps(
        ops,
        "org-1",
        PAYLOAD,
        count,
      );
      expect(result.error?.message).toMatch(`fail on copy ${failAt}`);
      expect(result.indents).toEqual([]);
      expect(cancelled).toHaveLength(failAt - 1);
    },
  );

  it("returns leftover copies if compensating cancel fails", async () => {
    const { ops } = makeOps({
      failCreateAt: 2,
      failCancelIds: ["id-1"],
    });
    const result = await createSharedIndentCopiesWithOps(
      ops,
      "org-1",
      PAYLOAD,
      5,
    );
    expect(result.error?.message).toMatch(/could not all be cancelled/i);
    expect(result.indents.map((row) => row.id)).toEqual(["id-1"]);
  });

  it("uses an existing draft as copy 1 then inserts the rest", async () => {
    const { ops } = makeOps();
    const result = await createSharedIndentCopiesWithOps(
      ops,
      "org-1",
      PAYLOAD,
      5,
      { existingDraftId: DRAFT_UUID },
    );
    expect(result.error).toBeNull();
    expect(result.indents).toHaveLength(5);
    expect(ops.updateIndentDraft).toHaveBeenCalledTimes(1);
    expect(ops.shareDraftIndent).toHaveBeenCalledTimes(1);
    expect(ops.createIndent).toHaveBeenCalledTimes(4);
  });
});
