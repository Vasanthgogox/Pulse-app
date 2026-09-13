import {
  groupPlanStopsToRouteSummaries,
  indentDisplayOriginDest,
} from "../executionPlanRouteSummary";

describe("groupPlanStopsToRouteSummaries", () => {
  it("uses warehouse city for pickups and stop address for drops", () => {
    const summaries = groupPlanStopsToRouteSummaries([
      {
        execution_plan_id: "plan-1",
        stop_type: "pickup",
        label: "Pickup A",
        city: null,
        state: null,
        address_line: null,
        warehouse: { city: "Chennai", state: "Tamil Nadu", address: "Muthu street" },
      },
      {
        execution_plan_id: "plan-1",
        stop_type: "drop",
        label: "Drop C",
        city: "",
        state: "",
        address_line: "Ramaraj street",
        warehouse: null,
      },
      {
        execution_plan_id: "plan-1",
        stop_type: "drop",
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
    });
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
          },
        },
      ),
    ).toEqual({
      origin: "Chennai, Tamil Nadu",
      dest: "Ramaraj street · Banglore, Karnataka",
    });
  });
});
