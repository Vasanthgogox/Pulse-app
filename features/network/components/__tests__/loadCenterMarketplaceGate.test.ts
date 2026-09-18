/**
 * Guards Load Center B+C: market remount honors staleTime; marketplace RPC
 * uses the same urgent bootstrap gate as market/quotes (not orgId-only).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Load Center marketplace + market remount gates", () => {
  it("useMarketIndentsQuery refetches on mount only when stale", () => {
    const source = readFileSync(
      join(__dirname, "../../../../lib/queries/useIndentsQuery.ts"),
      "utf8",
    );
    const marketHook = source.slice(
      source.indexOf("export function useMarketIndentsQuery"),
      source.indexOf("export async function getIntegratedSupplierOrgIdsForShipper"),
    );
    expect(marketHook).toContain("refetchOnMount: true");
    expect(marketHook).not.toContain("refetchOnMountIfEntityListEmpty");
  });

  it("Load Center marketplace list is gated with urgent useAppQueryGate", () => {
    const source = readFileSync(
      join(__dirname, "../LoadCenterView.tsx"),
      "utf8",
    );
    const marketplaceBlock = source.slice(
      source.indexOf("const marketplaceLoadsQ = useQuery("),
      source.indexOf("const marketplaceLoads = marketplaceLoadsQ.data"),
    );
    expect(marketplaceBlock).toContain(
      "enabled: useAppQueryGate(orgId, { urgent: !isTripsPresentation }) && !isTripsPresentation",
    );
    expect(marketplaceBlock).not.toContain("Boolean(orgId) && !isTripsPresentation");
  });
});
