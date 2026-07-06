import {
  getCurrentUser,
  getCurrentUserMemberships,
  getInvitationsForCurrentUser,
  getOrganizationsForCurrentUser,
} from "../services/platformOrganization.service";

const mockAuthGetUser = jest.fn();
const mockFrom = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    auth: { getUser: mockAuthGetUser },
    schema: () => ({ from: mockFrom }),
  }),
}));

function queryBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    is: jest.fn(() => builder),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    then: (resolve: (value: typeof result) => unknown) => resolve(result),
  };
  return builder;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getCurrentUser", () => {
  it("returns null without querying platform.users when there is no authenticated user", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const { error, user } = await getCurrentUser();

    expect(error).toBeNull();
    expect(user).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns the platform.users row for the authenticated user", async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "auth-1" } },
      error: null,
    });
    mockFrom.mockReturnValue(
      queryBuilder({
        data: {
          id: "usr-1",
          code: "USR-000001",
          auth_user_id: "auth-1",
          email: "a@b.com",
          display_name: "A",
          created_at: "now",
          updated_at: "now",
          deleted_at: null,
        },
        error: null,
      }),
    );

    const { error, user } = await getCurrentUser();

    expect(error).toBeNull();
    expect(user?.id).toBe("usr-1");
    expect(mockFrom).toHaveBeenCalledWith("users");
  });

  it("surfaces a Supabase error without throwing", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "auth-1" } }, error: null });
    mockFrom.mockReturnValue(queryBuilder({ data: null, error: { message: "boom" } }));

    const { error, user } = await getCurrentUser();

    expect(error?.message).toBe("boom");
    expect(user).toBeNull();
  });
});

describe("getOrganizationsForCurrentUser", () => {
  it("returns an empty array for a user with no platform.* bridge yet (expected pre-backfill state)", async () => {
    mockFrom.mockReturnValue(queryBuilder({ data: [], error: null }));

    const { error, organizations } = await getOrganizationsForCurrentUser();

    expect(error).toBeNull();
    expect(organizations).toEqual([]);
  });

  it("returns typed organizations on success", async () => {
    mockFrom.mockReturnValue(
      queryBuilder({
        data: [
          {
            id: "org-1",
            code: "ORG-000001",
            tenant_id: "ten-1",
            name: "Acme",
            legal_name: null,
            legacy_organization_id: null,
            created_at: "now",
            updated_at: "now",
            deleted_at: null,
          },
        ],
        error: null,
      }),
    );

    const { error, organizations } = await getOrganizationsForCurrentUser();

    expect(error).toBeNull();
    expect(organizations).toHaveLength(1);
    expect(organizations[0].name).toBe("Acme");
  });

  it("surfaces a Supabase error without throwing", async () => {
    mockFrom.mockReturnValue(queryBuilder({ data: null, error: { message: "rls denied" } }));

    const { error, organizations } = await getOrganizationsForCurrentUser();

    expect(error?.message).toBe("rls denied");
    expect(organizations).toEqual([]);
  });
});

describe("getCurrentUserMemberships", () => {
  it("returns typed memberships on success", async () => {
    mockFrom.mockReturnValue(
      queryBuilder({
        data: [
          {
            id: "mem-1",
            code: "MEM-000001",
            user_id: "usr-1",
            organization_id: "org-1",
            business_unit_id: null,
            role_id: 1,
            status: "active",
            created_at: "now",
            updated_at: "now",
          },
        ],
        error: null,
      }),
    );

    const { error, memberships } = await getCurrentUserMemberships();

    expect(error).toBeNull();
    expect(memberships).toHaveLength(1);
    expect(memberships[0].status).toBe("active");
  });

  it("surfaces a Supabase error without throwing", async () => {
    mockFrom.mockReturnValue(queryBuilder({ data: null, error: { message: "rls denied" } }));

    const { error, memberships } = await getCurrentUserMemberships();

    expect(error?.message).toBe("rls denied");
    expect(memberships).toEqual([]);
  });
});

describe("getInvitationsForCurrentUser", () => {
  it("returns an empty array for a typical invitee (RLS restricts SELECT to org admins)", async () => {
    mockFrom.mockReturnValue(queryBuilder({ data: [], error: null }));

    const { error, invitations } = await getInvitationsForCurrentUser();

    expect(error).toBeNull();
    expect(invitations).toEqual([]);
  });

  it("returns typed invitations on success (e.g. for an org admin)", async () => {
    mockFrom.mockReturnValue(
      queryBuilder({
        data: [
          {
            id: "inv-1",
            code: "INV-000001",
            organization_id: "org-1",
            email: "invitee@example.com",
            role_id: 2,
            business_unit_id: null,
            invited_by_user_id: "usr-1",
            status: "pending",
            expires_at: "later",
            created_at: "now",
            updated_at: "now",
          },
        ],
        error: null,
      }),
    );

    const { error, invitations } = await getInvitationsForCurrentUser();

    expect(error).toBeNull();
    expect(invitations).toHaveLength(1);
    expect(invitations[0].status).toBe("pending");
  });

  it("surfaces a Supabase error without throwing", async () => {
    mockFrom.mockReturnValue(queryBuilder({ data: null, error: { message: "rls denied" } }));

    const { error, invitations } = await getInvitationsForCurrentUser();

    expect(error?.message).toBe("rls denied");
    expect(invitations).toEqual([]);
  });
});
