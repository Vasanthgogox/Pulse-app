/**
 * Invitation picker — choose which pending invitation to accept.
 * Independent of workspace switcher and employment policy engine.
 */
export function requiresInvitationPicker(pendingInviteCount: number): boolean {
  return pendingInviteCount > 1;
}
