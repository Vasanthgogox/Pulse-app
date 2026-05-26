export type WorkspacePanelId =
  | "account"
  | "account-edit"
  | "settings"
  | "team"
  | "kyc";

export const WORKSPACE_PANEL_TITLES: Record<WorkspacePanelId, string> = {
  account: "My Account",
  "account-edit": "Edit profile",
  settings: "Workspace settings",
  team: "Team members",
  kyc: "Org identity & KYC",
};

export const WORKSPACE_PANEL_SUBTITLES: Partial<Record<WorkspacePanelId, string>> = {
  account: "Manage your personal identity",
  "account-edit": "Update your name, photo and status",
};

export function parseWorkspacePanelId(
  raw: string | string[] | undefined,
): WorkspacePanelId | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (
    value === "account" ||
    value === "account-edit" ||
    value === "settings" ||
    value === "team" ||
    value === "kyc"
  ) {
    return value;
  }
  return null;
}
