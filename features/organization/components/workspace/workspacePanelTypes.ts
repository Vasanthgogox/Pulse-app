export type WorkspacePanelId = "settings" | "team" | "kyc";

export const WORKSPACE_PANEL_TITLES: Record<WorkspacePanelId, string> = {
  settings: "Workspace settings",
  team: "Team members",
  kyc: "Org identity & KYC",
};

export function parseWorkspacePanelId(
  raw: string | string[] | undefined,
): WorkspacePanelId | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "settings" || value === "team" || value === "kyc") return value;
  return null;
}
