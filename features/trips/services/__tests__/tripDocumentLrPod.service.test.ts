import {
  indexLrPodDocuments,
  receivedLrNumbersForTrip,
  tripPodIsReceived,
  tripPodStatusFlags,
  tripIsDeliveredStatus,
  tripMatchesCompletionFilter,
} from "../tripDocumentLrPod.service";

describe("indexLrPodDocuments", () => {
  it("maps lr document_number and pod presence by trip_id", () => {
    const index = indexLrPodDocuments([
      { trip_id: "t1", document_type: "lr", document_number: "101,102" },
      { trip_id: "t1", document_type: "pod", document_number: null },
      { trip_id: "t2", document_type: "lr", document_number: '{"lrNumber":"AB9"}' },
    ]);
    expect(index.get("t1")?.lrNumbers).toEqual(["101", "102"]);
    expect(index.get("t1")?.hasPodDocument).toBe(true);
    expect(index.get("t2")?.lrNumbers).toEqual(["AB9"]);
    expect(index.get("t2")?.hasPodDocument).toBe(false);
  });
});

describe("tripPodIsReceived / receivedLrNumbersForTrip", () => {
  it("treats pod_received_at as trip-level received", () => {
    expect(tripPodIsReceived({ pod_received_at: "2026-09-10T00:00:00Z" })).toBe(
      true,
    );
    expect(tripPodIsReceived({ pod_received_at: null })).toBe(false);
  });

  it("fills received LRs when the trip has a POD document or received timestamp", () => {
    const lrs = ["A1", "A2"];
    expect(
      receivedLrNumbersForTrip(lrs, {
        tripReceived: true,
        hasPodDocument: false,
      }),
    ).toEqual(lrs);
    expect(
      receivedLrNumbersForTrip(lrs, {
        tripReceived: false,
        hasPodDocument: true,
      }),
    ).toEqual(lrs);
    expect(
      receivedLrNumbersForTrip(lrs, {
        tripReceived: false,
        hasPodDocument: false,
      }),
    ).toEqual([]);
  });
});

describe("tripIsDeliveredStatus", () => {
  it("is true only for delivered/completed/done", () => {
    expect(tripIsDeliveredStatus("delivered")).toBe(true);
    expect(tripIsDeliveredStatus("completed")).toBe(true);
    expect(tripIsDeliveredStatus("in_transit")).toBe(false);
    expect(tripIsDeliveredStatus("assigned", "DELIVERED")).toBe(true);
    expect(tripIsDeliveredStatus("in_progress", "IN TRANSIT")).toBe(false);
  });
});

describe("tripMatchesCompletionFilter", () => {
  it("all keeps every trip; completed/not_completed split on delivery", () => {
    expect(tripMatchesCompletionFilter("all", "in_transit")).toBe(true);
    expect(tripMatchesCompletionFilter("completed", "completed")).toBe(true);
    expect(tripMatchesCompletionFilter("completed", "in_transit")).toBe(false);
    expect(tripMatchesCompletionFilter("not_completed", "in_transit")).toBe(
      true,
    );
    expect(tripMatchesCompletionFilter("not_completed", "delivered")).toBe(
      false,
    );
  });
});

describe("tripPodStatusFlags — independent soft vs hard POD", () => {
  it("covers all four combinations without conflating sources", () => {
    expect(
      tripPodStatusFlags({ hasPodDocument: false, pod_received_at: null }),
    ).toEqual({ softCopyReceived: false, hardCopyReceived: false });
    expect(
      tripPodStatusFlags({
        hasPodDocument: true,
        pod_received_at: null,
      }),
    ).toEqual({ softCopyReceived: true, hardCopyReceived: false });
    expect(
      tripPodStatusFlags({
        hasPodDocument: false,
        pod_received_at: "2026-09-11T00:00:00Z",
      }),
    ).toEqual({ softCopyReceived: false, hardCopyReceived: true });
    expect(
      tripPodStatusFlags({
        hasPodDocument: true,
        pod_received_at: "2026-09-11T00:00:00Z",
      }),
    ).toEqual({ softCopyReceived: true, hardCopyReceived: true });
  });
});
