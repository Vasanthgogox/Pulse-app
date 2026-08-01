import { connectionInviteReceiverOutcome } from "@/features/network/utils/connectionInvite.util";

describe("connectionInviteReceiverOutcome", () => {
  it("maps Add Client invites to receiver Suppliers book", () => {
    expect(connectionInviteReceiverOutcome(true)).toEqual({
      pill: "JOINS AS SUPPLIER",
      subtitle: "Accepting adds them to your Suppliers list",
    });
  });

  it("maps Add Supplier invites to receiver Clients book", () => {
    expect(connectionInviteReceiverOutcome(false)).toEqual({
      pill: "JOINS AS CLIENT",
      subtitle: "Accepting adds them to your Clients list",
    });
  });
});
