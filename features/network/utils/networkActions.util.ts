/**
 * Single source of truth for Connect/Invite/Message button state across
 * network cards and the profile modal. Pure and deterministic — callers
 * normalize their own org type into NetworkActionsInput rather than this
 * helper learning DiscoverOrg/NetworkProfileNode/ConnectedOrg shapes.
 */

// Canonical UUID check — previously duplicated as three separate inline
// regexes in NetworkScreen.tsx (one strict RFC-4122, two looser copies).
export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isRegisteredOrgId(id: string | null | undefined): boolean {
  return !!id && UUID_REGEX.test(id);
}

export type NetworkConnectionStatus = "connected" | "pending" | "none";

export type NetworkActionsInput = {
  isRegisteredOrg: boolean;
  connectionStatus: NetworkConnectionStatus;
  /** Drivers are invited through driver-specific flows, not org connect. */
  isDriver?: boolean;
};

export type NetworkPrimaryAction = "connect" | "pending" | "message" | "invite" | "none";

export type NetworkActions = {
  primaryAction: NetworkPrimaryAction;
  primaryEnabled: boolean;
  primaryLabel: string;
  secondaryAction: "message" | "none";
  secondaryEnabled: boolean;
  secondaryLabel: string;
  /** Shown near the secondary action when disabled, e.g. under a tooltip. */
  secondaryHelperText: string | null;
  requiresRolePicker: boolean;
};

export function getNetworkActions(input: NetworkActionsInput): NetworkActions {
  const { isRegisteredOrg, connectionStatus, isDriver = false } = input;

  const messageAction = {
    secondaryAction: "message" as const,
    secondaryEnabled: isRegisteredOrg,
    secondaryLabel: "Message",
    secondaryHelperText: isRegisteredOrg
      ? null
      : "Messaging available after they join Pulse",
  };

  if (!isRegisteredOrg) {
    return {
      primaryAction: "invite",
      primaryEnabled: true,
      primaryLabel: "Invite to app",
      ...messageAction,
      requiresRolePicker: false,
    };
  }

  if (isDriver) {
    // Drivers connect through driver-invite flows, not org connection
    // requests — matches the existing handleSendProtocolFromProfile guard.
    return {
      primaryAction: "none",
      primaryEnabled: false,
      primaryLabel: "Connect",
      ...messageAction,
      requiresRolePicker: false,
    };
  }

  if (connectionStatus === "connected") {
    return {
      primaryAction: "message",
      primaryEnabled: true,
      primaryLabel: "Message",
      secondaryAction: "none",
      secondaryEnabled: false,
      secondaryLabel: "Message",
      secondaryHelperText: null,
      requiresRolePicker: false,
    };
  }

  if (connectionStatus === "pending") {
    return {
      primaryAction: "pending",
      primaryEnabled: true,
      primaryLabel: "Requested",
      ...messageAction,
      requiresRolePicker: false,
    };
  }

  return {
    primaryAction: "connect",
    primaryEnabled: true,
    primaryLabel: "Connect",
    ...messageAction,
    requiresRolePicker: true,
  };
}
