import {
  indexLrPodDocuments,
  receivedLrNumbersForTrip,
  tripPodIsReceived,
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
