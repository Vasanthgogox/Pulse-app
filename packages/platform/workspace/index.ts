/**
 * @pulse/platform-workspace — governing Platform Architecture's Workspace layer
 * (docs/architecture/platform/03-workspace.md). Not yet extracted — today's real
 * implementation is lib/platform-identity/workspace/workspaceContextStore.ts and
 * ActiveWorkspaceContext.
 *
 * `platformReady()` exists solely to prove module resolution works across Expo
 * and OMS (the monorepo/Metro validation). Deliberately trivial — do not export
 * anything architectural here until real Workspace logic is actually extracted.
 */
export function platformReady(): boolean {
  return true;
}
