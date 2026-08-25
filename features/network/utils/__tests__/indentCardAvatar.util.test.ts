import {
  giveLoadIndentAvatarProps,
  resolveGiveLoadClient,
} from "@/features/network/utils/indentCardAvatar.util";
import type { ClientRow } from "@/features/clients/services/clients.service";
import type { IndentRow } from "@/features/indents";

function client(partial: Partial<ClientRow> & { id: string; name: string }): ClientRow {
  return {
    organization_id: "org-1",
    contact_person: null,
    phone: "",
    email: null,
    address: null,
    gstin: null,
    pan_number: null,
    status: "active",
    created_at: "",
    updated_at: "",
    ...partial,
  } as ClientRow;
}

describe("giveLoadIndentAvatarProps", () => {
  const aero = client({
    id: "c-aero",
    name: "AERO",
    avatar_url: "orgs/aero/logo.png",
    avatar_seed: "seed-aero",
    linked_organization_id: "linked-aero",
  });

  const byId = new Map<string, ClientRow>([[aero.id, aero]]);

  it("resolves CRM client by name when indent has no client_id", () => {
    const load = {
      id: "ind-1",
      client_name: "AERO",
      client_id: null,
    } as IndentRow;

    expect(resolveGiveLoadClient(load, byId)?.id).toBe("c-aero");

    const avatar = giveLoadIndentAvatarProps(load, byId, {
      "linked-aero": { avatarUrl: "https://cdn.example/aero.png", avatarSeed: "x" },
    });
    expect(avatar.organizationImageUrl).toBe("https://cdn.example/aero.png");
    expect(avatar.initialsColorSeed).toBe("client-entity:c-aero");
  });

  it("falls back to client.avatar_url when linked-org map has no logo yet", () => {
    const load = {
      id: "ind-2",
      client_name: "aero",
    } as IndentRow;

    const avatar = giveLoadIndentAvatarProps(load, byId, {});
    expect(avatar.organizationImageUrl).toBe("orgs/aero/logo.png");
    expect(avatar.avatarUrl).toBe("orgs/aero/logo.png");
  });

  it("prefers client_id when present", () => {
    const other = client({
      id: "c-other",
      name: "AERO",
      avatar_url: "other.png",
    });
    const map = new Map<string, ClientRow>([
      [aero.id, aero],
      [other.id, other],
    ]);
    const load = {
      id: "ind-3",
      client_id: "c-other",
      client_name: "AERO",
    } as IndentRow;
    expect(resolveGiveLoadClient(load, map)?.id).toBe("c-other");
  });
});
