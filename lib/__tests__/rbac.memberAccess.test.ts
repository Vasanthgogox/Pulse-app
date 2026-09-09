/**
 * RBAC member-access suite — code-level mirror of docs/RBAC_TEAM_INVITE_FLOW.md
 * and the manual QA guide's test cases.
 *
 * Scope: the pure permission-resolution layer
 *   org capabilities  ∩  member domains  ∩  member surfaces
 *
 * Each `describe` is tagged with the manual TC it covers so a failure points
 * straight at the QA case that would have caught it by hand.
 *
 * NOT covered here (needs a DB / a running app, not unit tests):
 *   TC-01..04 invite precheck, TC-14..18 accept/expiry, TC-11 live refresh.
 *   Those are RPC-level and belong in an integration or e2e run.
 */
import {
  getCapabilitiesFromProfile,
  type Capability,
} from "@/lib/capabilities";
import {
  MEMBER_SURFACE_CATALOG,
  capabilitiesFromMemberSurfaces,
  defaultSurfacesForRole,
  domainsFromSurfaces,
  hydrateMemberSurfaces,
  memberHasSurface,
  orgAllowsSurface,
  surfaceGroupsForDomains,
  type MemberSurfaceId,
  type MemberSurfaceMap,
} from "@/lib/memberSurfaces";

// ── org fixtures ──────────────────────────────────────────────────────────
const capsFor = (model: string): Capability[] =>
  getCapabilitiesFromProfile({ role: "user" }, model);

const AGGREGATE = capsFor("NON_ASSET"); // give-load: dispatch, no fleet
const ASSET = capsFor("ASSET_BASED"); // own fleet: no give-load dispatch
const HYBRID = capsFor("HYBRID");

/** Grant a surface plus its whole `requires` chain — what the UI does on tick. */
function grant(ids: MemberSurfaceId[]): MemberSurfaceMap {
  const map: MemberSurfaceMap = {};
  const byId = new Map(MEMBER_SURFACE_CATALOG.map((d) => [d.id, d]));
  const walk = (id: MemberSurfaceId) => {
    if (map[id]) return;
    map[id] = true;
    const req = byId.get(id)?.requires;
    if (req) walk(req);
  };
  ids.forEach(walk);
  return map;
}

// ══════════════════════════════════════════════════════════════════════════
// TC-12 / TC-13 — org capability is the hard ceiling
// ══════════════════════════════════════════════════════════════════════════
describe("TC-12/13 — org capability caps member access", () => {
  it("TC-12: every box ticked still gives no fleet in a give-load org", () => {
    const everything = grant(MEMBER_SURFACE_CATALOG.map((s) => s.id));

    expect(memberHasSurface(AGGREGATE, everything, "fleet.vehicles.view")).toBe(false);
    expect(memberHasSurface(AGGREGATE, everything, "fleet.drivers.view")).toBe(false);
    expect(memberHasSurface(AGGREGATE, everything, "fleet.vehicles.add")).toBe(false);
  });

  it("TC-12: owner/admin bypass still cannot exceed org capability", () => {
    // bypass=true skips the member map but NOT the org gate.
    expect(memberHasSurface(AGGREGATE, null, "fleet.vehicles.view", true)).toBe(false);
  });

  it("TC-13: aggregate dispatcher gets trips + indents, never fleet", () => {
    const s = grant([
      "tripops.trips.view",
      "tripops.indents.view",
      "fleet.vehicles.view",
    ]);
    expect(memberHasSurface(AGGREGATE, s, "tripops.trips.view")).toBe(true);
    expect(memberHasSurface(AGGREGATE, s, "tripops.indents.view")).toBe(true);
    expect(memberHasSurface(AGGREGATE, s, "fleet.vehicles.view")).toBe(false);
  });

  it("asset-only org cannot create give-load indents even fully ticked", () => {
    const s = grant(["tripops.indents.create"]);
    expect(memberHasSurface(ASSET, s, "tripops.indents.create")).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// TC-10 / TC-20 — one checkbox off removes one action, not the whole group
// ══════════════════════════════════════════════════════════════════════════
describe("TC-10/20 — single surface toggle is surgical", () => {
  it("TC-10: removing Create indent keeps the list visible", () => {
    const s = grant(["tripops.indents.view", "tripops.indents.create"]);
    delete s["tripops.indents.create"];

    expect(memberHasSurface(AGGREGATE, s, "tripops.indents.view")).toBe(true);
    expect(memberHasSurface(AGGREGATE, s, "tripops.indents.create")).toBe(false);
  });

  it("TC-20: disabling one trip surface leaves siblings intact", () => {
    const s = grant([
      "tripops.trips.view",
      "tripops.trips.detail",
      "tripops.trips.assign",
    ]);
    delete s["tripops.trips.assign"];

    expect(memberHasSurface(AGGREGATE, s, "tripops.trips.detail")).toBe(true);
    expect(memberHasSurface(AGGREGATE, s, "tripops.trips.assign")).toBe(false);
  });

  it("revoking a parent cascades to every child", () => {
    const s = grant(["tripops.indents.create", "tripops.indents.award"]);
    s["tripops.indents.view"] = false; // parent off

    expect(memberHasSurface(AGGREGATE, s, "tripops.indents.create")).toBe(false);
    expect(memberHasSurface(AGGREGATE, s, "tripops.indents.award")).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// TC-21 — a surface cannot outrun its parent chain
// ══════════════════════════════════════════════════════════════════════════
describe("TC-21 — child surfaces cannot bypass a disabled parent/domain", () => {
  it("indent children are dead without sales.tab, even if ticked", () => {
    const s: MemberSurfaceMap = {
      "tripops.indents.view": true,
      "tripops.indents.create": true,
      // sales.tab deliberately absent — this is the "domain off" case
    };
    expect(memberHasSurface(AGGREGATE, s, "tripops.indents.create")).toBe(false);
  });

  it("finance children are dead without finance.tab", () => {
    const s: MemberSurfaceMap = { "finance.reports": true };
    expect(memberHasSurface(HYBRID, s, "finance.reports")).toBe(false);
  });

  it("every catalog surface with a parent fails when only itself is ticked", () => {
    const orphans = MEMBER_SURFACE_CATALOG.filter((d) => d.requires)
      .filter((d) => orgAllowsSurface(HYBRID, d.id))
      .filter((d) => memberHasSurface(HYBRID, { [d.id]: true }, d.id))
      .map((d) => d.id);

    expect(orphans).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// TC-09 — restricted floor
// ══════════════════════════════════════════════════════════════════════════
describe("TC-09 — restricted member has no functional access", () => {
  const restricted = defaultSurfacesForRole("restricted", HYBRID);

  it("restricted preset grants nothing", () => {
    expect(Object.keys(restricted)).toHaveLength(0);
  });

  it("all three domains resolve false", () => {
    expect(domainsFromSurfaces(restricted)).toEqual({
      finance: false,
      sales: false,
      tripops: false,
    });
  });

  it("no catalog surface is reachable", () => {
    const reachable = MEMBER_SURFACE_CATALOG.filter((d) =>
      memberHasSurface(HYBRID, restricted, d.id),
    );
    expect(reachable).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// TC-05..08 — role presets stay inside their domain
// ══════════════════════════════════════════════════════════════════════════
describe("TC-05..08 — role presets do not leak across domains", () => {
  const domainsTouched = (role: "finance" | "sales" | "tripops") => {
    const s = defaultSurfacesForRole(role, HYBRID);
    return new Set(
      MEMBER_SURFACE_CATALOG.filter((d) => s[d.id]).map((d) => d.domain),
    );
  };

  it("TC-06: finance preset reaches beyond finance only via read-only surfaces", () => {
    // Finance owns the fiscal domain, but its sub-tabs and the trip finance tab
    // read party directories, fleet rosters and trip detail — surfaces
    // catalogued under sales/fleet/tripops. Crossing those domains is intended;
    // what must never happen is a preset surface conferring a capability
    // finance has no business holding (dispatch, fleet_management).
    const s = defaultSurfacesForRole("finance", HYBRID);
    const crossDomain = MEMBER_SURFACE_CATALOG.filter(
      (d) => s[d.id] && d.domain !== "finance",
    );

    expect(crossDomain.length).toBeGreaterThan(0);
    const leaking = crossDomain
      .filter((d) => (d.grantsCaps ?? d.anyOfCaps).length > 0)
      .flatMap((d) =>
        (d.grantsCaps ?? d.anyOfCaps).map((c) => `${d.id} grants ${c}`),
      )
      .filter((entry) => !entry.endsWith("finance_view"));

    expect(leaking).toEqual([]);
  });

  it("TC-06b: finance preset confers no dispatch or fleet capability", () => {
    const caps = capabilitiesFromMemberSurfaces(
      HYBRID,
      defaultSurfacesForRole("finance", HYBRID),
    );

    expect(caps).not.toContain("dispatch");
    expect(caps).not.toContain("dispatch_for_own_fleet");
    expect(caps).not.toContain("fleet_management");
  });

  it("TC-07: sales preset touches only the sales domain", () => {
    expect([...domainsTouched("sales")]).toEqual(["sales"]);
  });

  it("TC-08: tripops preset stays within tripops + fleet", () => {
    const touched = [...domainsTouched("tripops")].sort();
    expect(touched).toEqual(["fleet", "tripops"]);
  });

  it("TC-05: admin preset covers every org-allowed surface", () => {
    const admin = defaultSurfacesForRole("admin", HYBRID);
    const missing = MEMBER_SURFACE_CATALOG.filter(
      (d) => orgAllowsSurface(HYBRID, d.id) && !admin[d.id],
    ).map((d) => d.id);

    expect(missing).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// TC-21A / 10A — Indents live under Sales; give-load orgs must still reach them
// Regression guard for the Operation → Sales move.
// ══════════════════════════════════════════════════════════════════════════
describe("TC-21A — Indents render under Sales and stay grantable", () => {
  const INDENT_SURFACES: MemberSurfaceId[] = [
    "tripops.indents.view",
    "tripops.indents.create",
    "tripops.indents.edit",
    "tripops.indents.cancel",
    "tripops.indents.broadcast",
    "tripops.indents.bid",
    "tripops.indents.award",
    "tripops.indents.allocate",
    "tripops.pulse_loads",
  ];

  it("all 9 indent surfaces sit in the sales domain", () => {
    const strays = MEMBER_SURFACE_CATALOG.filter(
      (d) => INDENT_SURFACES.includes(d.id) && d.domain !== "sales",
    ).map((d) => d.id);

    expect(strays).toEqual([]);
  });

  it("the Indents group is listed under Sales, not TripOps", () => {
    const salesGroups = surfaceGroupsForDomains(["sales"]).map((g) => g.group);
    const tripopsGroups = surfaceGroupsForDomains(["tripops"]).map((g) => g.group);

    expect(salesGroups).toContain("Indents");
    expect(tripopsGroups).not.toContain("Indents");
  });

  it("a give-load org can still grant every indent surface", () => {
    // The bug this guards: reparenting to sales.tab must not strand indents
    // in an org that has dispatch but no marketplace/client capability.
    const s = grant(INDENT_SURFACES);
    const blocked = INDENT_SURFACES.filter(
      (id) => !memberHasSurface(AGGREGATE, s, id),
    );

    expect(blocked).toEqual([]);
  });

  it("indent parents hang off sales.tab, not tripops.tab", () => {
    const parents = MEMBER_SURFACE_CATALOG.filter(
      (d) => INDENT_SURFACES.includes(d.id) && d.requires,
    ).map((d) => d.requires);

    expect(parents).not.toContain("tripops.tab");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Ground Ops — field staff who upload documents; no sibling-auto-add in hydration
// ══════════════════════════════════════════════════════════════════════════
describe("Ground Ops — hydration does not auto-add sibling surfaces", () => {
  it("Ground Ops default surfaces", () => {
    const groundOpsDefaults = defaultSurfacesForRole("ground_ops", HYBRID);
    const ids = Object.keys(groundOpsDefaults).filter((id) => groundOpsDefaults[id as MemberSurfaceId]);

    // Ground Ops should have exactly these surfaces (and parents will be added by hydration)
    expect(ids).toContain("tripops.tab");
    expect(ids).toContain("tripops.trips.view");
    expect(ids).toContain("tripops.trips.detail");
    expect(ids).toContain("tripops.trips.docs");
  });

  it("Ground Ops does NOT have finance/expenses/assign/reassign/tracking/verification/simulate/ratings by default", () => {
    const groundOpsDefaults = defaultSurfacesForRole("ground_ops", HYBRID);

    // These should NOT be in the default preset
    const forbiddenSurfaces: MemberSurfaceId[] = [
      "tripops.trips.finance",
      "tripops.trips.expenses",
      "tripops.trips.assign",
      "tripops.trips.reassign",
      "tripops.trips.tracking",
      "tripops.trips.verification",
      "tripops.trips.simulate",
      "tripops.trips.ratings",
    ];

    for (const surface of forbiddenSurfaces) {
      expect(groundOpsDefaults[surface]).not.toBe(true);
    }
  });

  it("hydrateMemberSurfaces preserves explicit false and does not overwrite it", () => {
    // Edge case: if a parent is explicitly false (via applySurfaceToggle OFF cascade),
    // hydration must not overwrite it to true, even if the child is true.
    // (This should not happen in production, but defensive code prevents it anyway.)
    const stored: MemberSurfaceMap = {
      "tripops.trips.docs": true,
      "tripops.trips.detail": false, // explicitly disabled (edge case, shouldn't occur)
    };

    const hydrated = hydrateMemberSurfaces(stored, HYBRID);

    // Parent chain should be filled in (tripops.trips.view, tripops.tab)
    expect(hydrated["tripops.trips.view"]).toBe(true);
    expect(hydrated["tripops.tab"]).toBe(true);

    // But the explicit false should be preserved (defensive measure)
    expect(hydrated["tripops.trips.detail"]).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Catalog integrity — cheap smoke checks that catch authoring mistakes
// ══════════════════════════════════════════════════════════════════════════
describe("catalog integrity (smoke)", () => {
  it("surface ids are unique", () => {
    const ids = MEMBER_SURFACE_CATALOG.map((d) => d.id);
    expect(ids).toHaveLength(new Set(ids).size);
  });

  it("every `requires` points at a real surface", () => {
    const ids = new Set(MEMBER_SURFACE_CATALOG.map((d) => d.id));
    const dangling = MEMBER_SURFACE_CATALOG.filter(
      (d) => d.requires && !ids.has(d.requires),
    ).map((d) => `${d.id} -> ${d.requires}`);

    expect(dangling).toEqual([]);
  });

  it("no surface requires itself, directly or in a cycle", () => {
    const byId = new Map(MEMBER_SURFACE_CATALOG.map((d) => [d.id, d]));
    const cyclic: string[] = [];

    for (const def of MEMBER_SURFACE_CATALOG) {
      const seen = new Set<string>([def.id]);
      let cur = def.requires;
      while (cur) {
        if (seen.has(cur)) {
          cyclic.push(def.id);
          break;
        }
        seen.add(cur);
        cur = byId.get(cur)?.requires;
      }
    }

    expect(cyclic).toEqual([]);
  });

  it("a child never sits in a different domain from its parent", () => {
    const byId = new Map(MEMBER_SURFACE_CATALOG.map((d) => [d.id, d]));
    const split = MEMBER_SURFACE_CATALOG.filter((d) => {
      if (!d.requires) return false;
      const parent = byId.get(d.requires);
      return parent && parent.domain !== d.domain;
    }).map((d) => `${d.id} (${d.domain}) -> ${d.requires}`);

    expect(split).toEqual([]);
  });

  it("every surface declares at least one capability", () => {
    const capless = MEMBER_SURFACE_CATALOG.filter(
      (d) => !d.anyOfCaps || d.anyOfCaps.length === 0,
    ).map((d) => d.id);

    expect(capless).toEqual([]);
  });
});
