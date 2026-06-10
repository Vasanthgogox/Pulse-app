export type WorkspacePanelId =
  | "account"
  | "account-edit"
  | "settings"
  | "team"
  | "kyc"
  | "products"
  | "language"
  | "region";

export const WORKSPACE_PANEL_TITLES: Record<WorkspacePanelId, string> = {
  account: "My Account",
  "account-edit": "Edit profile",
  settings: "Workspace settings",
  team: "Team members",
  kyc: "Org identity & KYC",
  products: "Pulse Products",
  language: "Language",
  region: "Region",
};

export const WORKSPACE_PANEL_SUBTITLES: Partial<Record<WorkspacePanelId, string>> = {
  account: "Manage your personal identity",
  "account-edit": "Update your name, photo and status",
  products: "Your logistics business operating system",
};

export type WorkspaceHubInlinePanelId = "language" | "region";

export const WORKSPACE_HUB_INLINE_PANELS: WorkspaceHubInlinePanelId[] = [
  "language",
  "region",
];

export function isWorkspaceHubInlinePanel(
  panel: WorkspacePanelId | null,
): panel is WorkspaceHubInlinePanelId {
  return panel === "language" || panel === "region";
}

export function parseWorkspacePanelId(
  raw: string | string[] | undefined,
): WorkspacePanelId | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (
    value === "account" ||
    value === "account-edit" ||
    value === "settings" ||
    value === "team" ||
    value === "kyc" ||
    value === "products" ||
    value === "language" ||
    value === "region"
  ) {
    return value;
  }
  return null;
}
