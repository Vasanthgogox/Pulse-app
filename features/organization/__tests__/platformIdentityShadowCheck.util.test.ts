import { shadowCheckPlatformIdentity } from "../utils/platformIdentityShadowCheck.util";

const mockGetOrganizationsForCurrentUser = jest.fn();
const mockGetCurrentUserMemberships = jest.fn();
const mockGetInvitationsForCurrentUser = jest.fn();

jest.mock("../services/platformOrganization.service", () => ({
  getOrganizationsForCurrentUser: () => mockGetOrganizationsForCurrentUser(),
  getCurrentUserMemberships: () => mockGetCurrentUserMemberships(),
  getInvitationsForCurrentUser: () => mockGetInvitationsForCurrentUser(),
}));

const mockLoggerDebug = jest.fn();
const mockLoggerWarn = jest.fn();

jest.mock("@/lib/logger", () => ({
  logger: {
    debug: (...args: unknown[]) => mockLoggerDebug(...args),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
  },
}));

function platformOrg(legacyOrganizationId: string | null) {
  return {
    id: "platform-org-id",
    code: "ORG-000001",
    tenant_id: "ten-1",
    name: "Acme",
    legal_name: null,
    legacy_organization_id: legacyOrganizationId,
    created_at: "now",
    updated_at: "now",
    deleted_at: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("shadowCheckPlatformIdentity — organization reconciliation", () => {
  it("reports matched: false with the legacy org in `missing` when no backfill exists yet (expected today)", async () => {
    mockGetOrganizationsForCurrentUser.mockResolvedValue({ error: null, organizations: [] });
    mockGetCurrentUserMemberships.mockResolvedValue({ error: null, memberships: [] });
    mockGetInvitationsForCurrentUser.mockResolvedValue({ error: null, invitations: [] });

    await shadowCheckPlatformIdentity({
      flow: "business_signup",
      legacyOrganizationIds: ["legacy-org-1"],
    });

    expect(mockLoggerDebug).toHaveBeenCalledWith(
      "platform_identity_shadow",
      expect.objectContaining({
        matched: false,
        organizationMismatch: true,
        organizationMissing: ["legacy-org-1"],
        organizationUnexpected: [],
        organizationLegacyCount: 1,
        organizationPlatformCount: 0,
      }),
    );
  });

  it("reports matched: true when platform.organizations.legacy_organization_id links back correctly", async () => {
    mockGetOrganizationsForCurrentUser.mockResolvedValue({
      error: null,
      organizations: [platformOrg("legacy-org-1")],
    });
    mockGetCurrentUserMemberships.mockResolvedValue({ error: null, memberships: [] });
    mockGetInvitationsForCurrentUser.mockResolvedValue({ error: null, invitations: [] });

    await shadowCheckPlatformIdentity({
      flow: "invitation_join",
      legacyOrganizationIds: ["legacy-org-1"],
    });

    expect(mockLoggerDebug).toHaveBeenCalledWith(
      "platform_identity_shadow",
      expect.objectContaining({
        matched: true,
        organizationMismatch: false,
        organizationMissing: [],
        organizationUnexpected: [],
      }),
    );
  });

  it("reports an unexpected platform org when its legacy_organization_id isn't in the caller's legacy set", async () => {
    mockGetOrganizationsForCurrentUser.mockResolvedValue({
      error: null,
      organizations: [platformOrg("legacy-org-1"), platformOrg("legacy-org-stray")],
    });
    mockGetCurrentUserMemberships.mockResolvedValue({ error: null, memberships: [] });
    mockGetInvitationsForCurrentUser.mockResolvedValue({ error: null, invitations: [] });

    await shadowCheckPlatformIdentity({
      flow: "business_signup",
      legacyOrganizationIds: ["legacy-org-1"],
    });

    expect(mockLoggerDebug).toHaveBeenCalledWith(
      "platform_identity_shadow",
      expect.objectContaining({
        matched: false,
        organizationMissing: [],
        organizationUnexpected: ["legacy-org-stray"],
      }),
    );
  });
});

describe("shadowCheckPlatformIdentity — membership/invitation counts", () => {
  it("logs platform-side counts only, with no missing/unexpected claim", async () => {
    mockGetOrganizationsForCurrentUser.mockResolvedValue({ error: null, organizations: [] });
    mockGetCurrentUserMemberships.mockResolvedValue({
      error: null,
      memberships: [{}, {}],
    });
    mockGetInvitationsForCurrentUser.mockResolvedValue({
      error: null,
      invitations: [{}],
    });

    await shadowCheckPlatformIdentity({ flow: "business_signup", legacyOrganizationIds: [] });

    expect(mockLoggerDebug).toHaveBeenCalledWith(
      "platform_identity_shadow",
      expect.objectContaining({
        membershipPlatformCount: 2,
        invitationPlatformCount: 1,
      }),
    );
  });
});

describe("shadowCheckPlatformIdentity — failure handling", () => {
  it("never throws and logs a warning (not a throw) when an adapter read errors", async () => {
    mockGetOrganizationsForCurrentUser.mockResolvedValue({
      error: new Error("network down"),
      organizations: [],
    });
    mockGetCurrentUserMemberships.mockResolvedValue({ error: null, memberships: [] });
    mockGetInvitationsForCurrentUser.mockResolvedValue({ error: null, invitations: [] });

    await expect(
      shadowCheckPlatformIdentity({ flow: "invitation_join", legacyOrganizationIds: ["legacy-org-1"] }),
    ).resolves.toBeUndefined();

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "platform_identity_shadow_read_failed",
      expect.objectContaining({ flow: "invitation_join", orgsError: "network down" }),
    );
    expect(mockLoggerDebug).not.toHaveBeenCalled();
  });

  it("never throws even if an adapter call rejects unexpectedly", async () => {
    mockGetOrganizationsForCurrentUser.mockRejectedValue(new Error("boom"));
    mockGetCurrentUserMemberships.mockResolvedValue({ error: null, memberships: [] });
    mockGetInvitationsForCurrentUser.mockResolvedValue({ error: null, invitations: [] });

    await expect(
      shadowCheckPlatformIdentity({ flow: "business_signup", legacyOrganizationIds: [] }),
    ).resolves.toBeUndefined();

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "platform_identity_shadow_unexpected_failure",
      expect.objectContaining({ flow: "business_signup", error: "boom" }),
    );
  });
});
