import {
  acquireSubmitLock,
  beginConfirmOnce,
  releaseSubmitLock,
  shouldSkipLockedSubmit,
  type ConfirmInFlight,
} from "@/features/indents/utils/indentShareSubmitGuard.util";

describe("share submit lock", () => {
  it("blocks double-click Share before a second confirmation can open", () => {
    const lock = { current: false };
    expect(shouldSkipLockedSubmit(false, lock)).toBe(false);
    expect(acquireSubmitLock(lock)).toBe(true);
    expect(shouldSkipLockedSubmit(false, lock)).toBe(true);
    expect(acquireSubmitLock(lock)).toBe(false);
    releaseSubmitLock(lock);
    expect(shouldSkipLockedSubmit(false, lock)).toBe(false);
  });

  it("treats React submitting state as locked", () => {
    expect(shouldSkipLockedSubmit(true, { current: false })).toBe(true);
  });
});

describe("beginConfirmOnce", () => {
  it("reuses the in-flight Share confirmation instead of replacing the resolver", async () => {
    const slot: { current: ConfirmInFlight<"share" | "draft"> } = {
      current: null,
    };
    let openCount = 0;
    const open = () => {
      openCount += 1;
      return Promise.resolve(true);
    };
    const first = beginConfirmOnce(slot, "share", open);
    const second = beginConfirmOnce(slot, "share", open);
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(openCount).toBe(1);
  });

  it("does not let a second confirm kind overwrite the first resolver", async () => {
    const slot: { current: ConfirmInFlight<"share" | "draft"> } = {
      current: null,
    };
    let resolveShare: ((ok: boolean) => void) | undefined;
    const share = beginConfirmOnce(slot, "share", () => {
      return new Promise<boolean>((resolve) => {
        resolveShare = resolve;
      });
    });
    const draft = beginConfirmOnce(slot, "draft", () => Promise.resolve(true));
    await expect(draft).resolves.toBe(false);
    resolveShare?.(true);
    await expect(share).resolves.toBe(true);
  });
});
