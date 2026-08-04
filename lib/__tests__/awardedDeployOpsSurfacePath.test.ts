import { isAwardedDeployOpsSurfacePath } from "@/lib/routes";

describe("isAwardedDeployOpsSurfacePath", () => {
  it("allows Trips and Load Center only (not trip detail)", () => {
    expect(isAwardedDeployOpsSurfacePath("/trips")).toBe(true);
    expect(isAwardedDeployOpsSurfacePath("/(tabs)/trips")).toBe(true);
    expect(isAwardedDeployOpsSurfacePath("/pulse-loads")).toBe(true);
    expect(isAwardedDeployOpsSurfacePath("/indents")).toBe(true);
    expect(isAwardedDeployOpsSurfacePath("/trip/abc-123")).toBe(false);
  });

  it("blocks Finance, Chat, Network, Settings-style surfaces", () => {
    expect(isAwardedDeployOpsSurfacePath("/finance")).toBe(false);
    expect(isAwardedDeployOpsSurfacePath("/(tabs)/finance")).toBe(false);
    expect(isAwardedDeployOpsSurfacePath("/chat")).toBe(false);
    expect(isAwardedDeployOpsSurfacePath("/network")).toBe(false);
    expect(isAwardedDeployOpsSurfacePath("/network/hub")).toBe(false);
    expect(isAwardedDeployOpsSurfacePath("/profile")).toBe(false);
    expect(isAwardedDeployOpsSurfacePath("/workspace")).toBe(false);
    expect(isAwardedDeployOpsSurfacePath("/resources")).toBe(false);
  });
});
