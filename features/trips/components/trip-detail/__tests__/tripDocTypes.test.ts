import { canAddMoreTripDocs, isPdfTripDoc } from "../tripDocTypes";

describe("isPdfTripDoc", () => {
  it("detects PDF from vault type", () => {
    expect(isPdfTripDoc({ type: "PDF" })).toBe(true);
    expect(isPdfTripDoc({ type: "JPG" })).toBe(false);
  });

  it("detects PDF from mime type even when type is image-like", () => {
    expect(
      isPdfTripDoc({ type: "JPG", mimeType: "application/pdf" }),
    ).toBe(true);
  });

  it("detects PDF from file name or storage path when mime is missing", () => {
    expect(
      isPdfTripDoc({
        type: "JPG",
        fileName: "lr-scan.pdf",
        storagePath: "trip-1/lr/abc.jpg",
      }),
    ).toBe(true);
    expect(
      isPdfTripDoc({
        type: "JPG",
        storagePath: "trip-1/lr/abc.pdf?token=1",
      }),
    ).toBe(true);
  });

  it("does not treat images as PDFs", () => {
    expect(
      isPdfTripDoc({
        type: "JPG",
        mimeType: "image/jpeg",
        fileName: "pod.jpg",
        storagePath: "trip-1/pod/abc.jpg",
      }),
    ).toBe(false);
  });
});

describe("canAddMoreTripDocs", () => {
  it("allows extra files for trip-scoped vault slots", () => {
    expect(canAddMoreTripDocs({ category: "lr" })).toBe(true);
    expect(canAddMoreTripDocs({ category: "trip" })).toBe(true);
    expect(canAddMoreTripDocs({ category: "driver" })).toBe(true);
  });

  it("does not allow extra files for vehicle documents", () => {
    expect(canAddMoreTripDocs({ category: "vehicle" })).toBe(false);
    expect(canAddMoreTripDocs({ docSource: "vehicle", category: "lr" })).toBe(
      false,
    );
  });
});
