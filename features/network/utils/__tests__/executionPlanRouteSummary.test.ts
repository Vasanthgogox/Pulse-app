import {
  groupPlanStopsToRouteSummaries,
  indentDisplayOriginDest,
  isMultiOrderExecutionPlan,
} from "../executionPlanRouteSummary";

describe("groupPlanStopsToRouteSummaries", () => {
  it("uses warehouse city for pickups and stop address for drops", () => {
    const summaries = groupPlanStopsToRouteSummaries([
      {
        execution_plan_id: "plan-1",
        stop_type: "pickup",
        sequence: 1,
        label: "Pickup A",
        city: null,
        state: null,
        address_line: null,
        warehouse: { city: "Chennai", state: "Tamil Nadu", address: "Muthu street" },
      },
      {
        execution_plan_id: "plan-1",
        stop_type: "drop",
        sequence: 2,
        label: "Drop C",
        city: "",
        state: "",
        address_line: "Ramaraj street",
        warehouse: null,
      },
      {
        execution_plan_id: "plan-1",
        stop_type: "drop",
        sequence: 3,
        label: "Drop D",
        city: "Banglore",
        state: "Karnataka",
        address_line: "Mukunt drear",
        warehouse: null,
      },
    ]);

    expect(summaries["plan-1"]).toEqual({
      pickup: "Chennai, Tamil Nadu",
      drop: "Ramaraj street · Banglore, Karnataka",
      stops: [
        {
          sequence: expect.any(Number),
          kind: "pickup",
          kindIndex: 1,
          caption: "Pickup 1",
          place: "Chennai, Tamil Nadu",
          latitude: null,
          longitude: null,
        },
        {
          sequence: expect.any(Number),
          kind: "drop",
          kindIndex: 1,
          caption: "Drop 1",
          place: "Ramaraj street",
          latitude: null,
          longitude: null,
        },
        {
          sequence: expect.any(Number),
          kind: "drop",
          kindIndex: 2,
          caption: "Drop 2",
          place: "Banglore, Karnataka",
          latitude: null,
          longitude: null,
        },
      ],
    });
    expect(isMultiOrderExecutionPlan(summaries["plan-1"])).toBe(true);
  });
});

describe("indentDisplayOriginDest", () => {
  it("overlays planner labels with plan locations", () => {
    expect(
      indentDisplayOriginDest(
        {
          pickup_area: "Pickup A",
          drop_location: "2 drops (Drop C, Drop D)",
          execution_plan_id: "plan-1",
        },
        {
          "plan-1": {
            pickup: "Chennai, Tamil Nadu",
            drop: "Ramaraj street · Banglore, Karnataka",
            stops: [],
          },
        },
      ),
    ).toEqual({
      origin: "Chennai, Tamil Nadu",
      dest: "Ramaraj street · Banglore, Karnataka",
    });
  });
});
