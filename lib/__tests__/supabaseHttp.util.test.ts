import {
  isOriginDownError,
  isOriginDownErrorMessage,
  isOriginDownHttpStatus,
  isRetryableHttpResponse,
} from "@/lib/supabaseHttp.util";

function makeResponse(status: number, contentType = "application/json"): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? contentType : null) },
  } as unknown as Response;
}

describe("supabaseHttp origin-down vs transient", () => {
  it("marks 503 and 521 as origin-down statuses", () => {
    expect(isOriginDownHttpStatus(503)).toBe(true);
    expect(isOriginDownHttpStatus(521)).toBe(true);
    expect(isOriginDownHttpStatus(522)).toBe(false);
    expect(isOriginDownHttpStatus(500)).toBe(false);
  });

  it("does not retry origin-down HTTP responses", () => {
    expect(isRetryableHttpResponse(makeResponse(503))).toBe(false);
    expect(isRetryableHttpResponse(makeResponse(521))).toBe(false);
  });

  it("retries eligible transient statuses with backoff path", () => {
    expect(isRetryableHttpResponse(makeResponse(522))).toBe(true);
    expect(isRetryableHttpResponse(makeResponse(502))).toBe(true);
    expect(isRetryableHttpResponse(makeResponse(429))).toBe(true);
  });

  it("classifies origin-down messages including 57P03", () => {
    expect(isOriginDownErrorMessage("57P03 the database system is not accepting connections")).toBe(true);
    expect(isOriginDownErrorMessage("JWT expired")).toBe(false);
  });

  it("classifies plain objects by status/code even without digits in message", () => {
    expect(isOriginDownError({ message: "Service Unavailable", status: 503 })).toBe(true);
    expect(isOriginDownError({ message: "Web server is down", status: 521 })).toBe(true);
    expect(isOriginDownError({ message: "not accepting connections", code: "57P03" })).toBe(true);
    expect(isOriginDownError({ message: "JWT expired", code: "PGRST301", status: 401 })).toBe(false);
  });
});
