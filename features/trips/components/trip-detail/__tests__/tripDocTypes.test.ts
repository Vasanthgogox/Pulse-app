import {
  canAddMoreTripDocs,
  canMutateTripVaultDoc,
  isDriverPodVaultDoc,
  isPdfTripDoc,
  vaultPickerRejectionMessage,
} from "../tripDocTypes";

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

describe("canMutateTripVaultDoc", () => {
  it("blocks Driver POD until the trip is completed", () => {
    expect(
      canMutateTripVaultDoc({
        doc: { id: "pod", category: "driver" },
        canUploadTripDocs: true,
        tripCompleted: false,
      }),
    ).toBe(false);
    expect(
      canMutateTripVaultDoc({
        doc: { id: "pod", category: "driver" },
        canUploadTripDocs: true,
        tripCompleted: true,
      }),
    ).toBe(true);
  });

  it("does not gate LR or manifest on trip completion", () => {
    expect(
      canMutateTripVaultDoc({
        doc: { id: "lr", category: "lr" },
        canUploadTripDocs: true,
        tripCompleted: false,
      }),
    ).toBe(true);
    expect(isDriverPodVaultDoc({ id: "manifest", category: "trip" })).toBe(
      false,
    );
  });
});

describe("canAddMoreTripDocs", () => {
  it("allows extra files for trip-scoped vault slots", () => {
    expect(canAddMoreTripDocs({ category: "lr" })).toBe(true);
    expect(canAddMoreTripDocs({ category: "trip" })).toBe(true);
    expect(canAddMoreTripDocs({ category: "driver" })).toBe(true);
  });

  it("allows extra files for vehicle documents", () => {
    expect(canAddMoreTripDocs({ category: "vehicle" })).toBe(true);
    expect(canAddMoreTripDocs({ id: "vehicle-documents" })).toBe(true);
    expect(
      canAddMoreTripDocs({ docSource: "vehicle", category: "vehicle" }),
    ).toBe(true);
  });
});

describe("vaultPickerRejectionMessage", () => {
  it("rejects files over 10 MB", () => {
    expect(
      vaultPickerRejectionMessage([
        { name: "scan.pdf", mimeType: "application/pdf", size: 11 * 1024 * 1024 },
      ]),
    ).toMatch(/10 MB/);
  });

  it("rejects unsupported types", () => {
    expect(
      vaultPickerRejectionMessage([
        { name: "notes.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      ]),
    ).toMatch(/not supported/);
  });

  it("accepts PDF and JPEG under the limit", () => {
    expect(
      vaultPickerRejectionMessage([
        { name: "lr.pdf", mimeType: "application/pdf", size: 2 * 1024 * 1024 },
        { name: "pod.jpg", mimeType: "image/jpeg", size: 500_000 },
      ]),
    ).toBeNull();
  });
});
