import { hydrateMemberSurfaces, memberHasSurface, capabilitiesFromMemberSurfaces } from "@/lib/memberSurfaces";
import { getCapabilitiesFromProfile, canAccessFinanceSubTab } from "@/lib/capabilities";

const caps = (m: any) => getCapabilitiesFromProfile({} as any, m);
const resolve = (stored: any, model: any = "HYBRID", bypass = false) => {
  const o = caps(model);
  const h = hydrateMemberSurfaces(stored, o);
  return {
    can: (id: string) => memberHasSurface(o, h, id as any, bypass),
    memberCaps: capabilitiesFromMemberSurfaces(o, h, bypass),
  };
};

describe("OFF states", () => {
  test("empty map denies everything", () => {
    const r = resolve({});
    for (const id of ["finance.tab","finance.view","finance.subtab.cash","finance.reports","sales.clients.detail"]) {
      expect(r.can(id)).toBe(false);
    }
  });

  test("explicit false denies", () => {
    const r = resolve({ "finance.tab": false, "finance.view": false, "finance.subtab.cash": false });
    expect(r.can("finance.subtab.cash")).toBe(false);
  });

  test("child true but PARENT off => denied (cascade)", () => {
    const r = resolve({ "finance.view": false, "finance.subtab.cash": true, "finance.reports": true });
    expect(r.can("finance.subtab.cash")).toBe(false);
    expect(r.can("finance.reports")).toBe(false);
  });

  test("parent on, child explicitly off => only child denied", () => {
    // finance.subtab.customers needs DISP caps, which come from sales surfaces.
    const r = resolve({ "finance.tab": true, "finance.view": true, "finance.subtab.cash": false,
      "finance.subtab.customers": true, "sales.tab": true, "sales.clients.view": true });
    expect(r.can("finance.subtab.cash")).toBe(false);
    expect(r.can("finance.subtab.customers")).toBe(true);
  });
});

describe("DYNAMIC toggle on->off->on", () => {
  test("flipping one surface flips only that surface", () => {
    const base = { "finance.tab": true, "finance.view": true, "finance.subtab.cash": true,
      "finance.subtab.customers": true, "finance.reports": true, "sales.tab": true, "sales.clients.view": true };
    const on = resolve(base);
    const off = resolve({ ...base, "finance.reports": false });
    const back = resolve({ ...base, "finance.reports": true });
    expect([on.can("finance.reports"), off.can("finance.reports"), back.can("finance.reports")]).toEqual([true,false,true]);
    // neighbours unchanged
    for (const r of [on, off, back]) expect(r.can("finance.subtab.cash")).toBe(true);
  });
});

describe("OPERATING MODEL variants", () => {
  const surf = { "finance.view": true, "finance.subtab.cash": true, "tripops.tab": true, "tripops.trips.view": true, "fleet.vehicles.view": true };
  for (const model of ["HYBRID","ASSET_BASED","NON_ASSET"] as const) {
    test(`${model} resolves without leaking`, () => {
      const r = resolve(surf, model);
      // never grants what the map doesn't contain
      expect(r.can("finance.reports")).toBe(false);
      expect(r.can("sales.clients.detail")).toBe(false);
    });
  }
});

describe("BYPASS (owner/admin)", () => {
  test("bypass grants regardless of empty map", () => {
    const r = resolve({}, "HYBRID", true);
    expect(r.can("finance.subtab.cash")).toBe(true);
    expect(r.can("finance.reports")).toBe(true);
  });
});

describe("CAP LEAKAGE", () => {
  test("finance-only member gets no tripops caps", () => {
    const r = resolve({ "finance.tab": true, "finance.view": true, "finance.subtab.cash": true });
    expect(r.memberCaps).not.toContain("fleet_management");
    expect(r.memberCaps).not.toContain("team_manage");
  });
});

describe("FINANCE SUBTAB matrix (real screen filter)", () => {
  const rows = [
    ["all on",      { "finance.tab":true,"finance.view":true,"sales.tab":true,"finance.subtab.cash":true,"finance.subtab.customers":true,"finance.subtab.suppliers":true,"finance.subtab.garage":true,"finance.subtab.drivers":true,"fleet.vehicles.view":true,"fleet.drivers.view":true,"sales.clients.view":true,"sales.suppliers.view":true }],
    ["ayush live",  { "finance.tab":true,"finance.view":true,"sales.tab":true,"finance.subtab.cash":true,"finance.subtab.customers":true,"finance.subtab.suppliers":true,"finance.subtab.garage":true,"finance.subtab.drivers":true,"fleet.vehicles.view":false,"fleet.drivers.view":false,"sales.clients.view":true,"sales.suppliers.view":true }],
    ["cash only",   { "finance.tab":true,"finance.view":true,"finance.subtab.cash":true }],
    ["all off",     { "finance.tab":true,"finance.view":true }],
    ["parent off",  { "finance.tab":true,"finance.view":false,"finance.subtab.cash":true }],
  ] as const;

  for (const [name, surfaces] of rows) {
    test(name, () => {
      const o = caps("HYBRID");
      const h = hydrateMemberSurfaces(surfaces as any, o);
      const mc = capabilitiesFromMemberSurfaces(o, h, false);
      const visible = (["cash","customers","suppliers","garage","drivers"] as const).filter((t) => {
        if (!canAccessFinanceSubTab(mc, t)) return false;
        if (!memberHasSurface(o, h, `finance.subtab.${t}` as any, false)) return false;
        if (t === "garage") return memberHasSurface(o, h, "fleet.vehicles.view" as any, false);
        if (t === "drivers") return memberHasSurface(o, h, "fleet.drivers.view" as any, false);
        return true;
      });
      console.log(`TABS [${name}] =>`, visible.join(", ") || "(none)");
    });
  }
});
