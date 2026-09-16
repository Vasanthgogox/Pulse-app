// lib/queryClient.ts transitively imports lib/crashReporter.ts -> @sentry/react-native,
// which jest can't transform (ESM). Mock the logger so this file loads in isolation —
// shouldRetryQuery itself has no runtime dependency on it.
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { shouldRetryQuery } from "@/lib/queryClient";

describe("shouldRetryQuery", () => {
  it("retries a plain transient error once", () => {
    expect(shouldRetryQuery(0, new Error("network blip"))).toBe(true);
  });

  it("does not retry after the first failure (retry: 1 semantics preserved)", () => {
    expect(shouldRetryQuery(1, new Error("network blip"))).toBe(false);
    expect(shouldRetryQuery(2, new Error("network blip"))).toBe(false);
  });

  it("does not retry an aborted/cancelled request", () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    expect(shouldRetryQuery(0, abortError)).toBe(false);
  });

  it("does not retry a Postgres statement timeout (57014)", () => {
    expect(
      shouldRetryQuery(0, { message: "canceling statement due to statement timeout", code: "57014" }),
    ).toBe(false);
  });

  it("does not retry a plain 'timed out' message", () => {
    expect(shouldRetryQuery(0, new Error("Request timed out"))).toBe(false);
  });

  it("still retries a non-timeout 5xx-shaped error once", () => {
    expect(shouldRetryQuery(0, { message: "Internal Server Error", status: 500 })).toBe(true);
  });
});
