/**
 * PulseAvatar — surface-aware avatar component built on PartyAvatar.
 *
 * Three surfaces:
 *   personal   → user's own photo / initials (chat, account settings)
 *   business   → org logo → personal photo → initials (dispatch, invoices, network)
 *   driver     → driver's own photo / initials
 *
 * When showVerifiedBadge is true and the active workspace KYC status is
 * 'verified', a green checkmark badge is rendered at the bottom-right corner.
 *
 * Defaults from useAuth() and useOptionalActiveWorkspace() are used when
 * explicit override props are not passed.
 */
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { PartyAvatar } from '@/components/PartyAvatar';
import { useAuth } from '@/contexts/AuthContext';
import { useOptionalActiveWorkspace } from '@/contexts/ActiveWorkspaceContext';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type PulseSurface = 'personal' | 'business' | 'driver';

export interface PulseAvatarProps {
  surface: PulseSurface;
  // Override data — if not provided, reads from useAuth() and useActiveWorkspace()
  name?: string;
  personalAvatarUrl?: string | null;
  workspaceLogoUrl?: string | null;
  // Driver-only
  driverAvatarUrl?: string | null;
  // Layout
  size?: number;
  shape?: 'circle' | 'rounded' | 'square';
  style?: StyleProp<ViewStyle>;
  showBorder?: boolean;
  // Show green checkmark badge when workspace.verification_status === 'verified'
  showVerifiedBadge?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SIZE = 40;
const BADGE_SIZE = 14;
const BADGE_COLOR = '#15803D';

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function PulseAvatar({
  surface,
  name: nameProp,
  personalAvatarUrl: personalAvatarUrlProp,
  workspaceLogoUrl: workspaceLogoUrlProp,
  driverAvatarUrl: driverAvatarUrlProp,
  size = DEFAULT_SIZE,
  shape,
  style,
  showBorder = true,
  showVerifiedBadge = false,
}: PulseAvatarProps) {
  const { profile } = useAuth();
  const workspace = useOptionalActiveWorkspace();

  // Resolve values — props win over context defaults
  const resolvedName = nameProp ?? profile?.full_name ?? profile?.displayName ?? '';
  const resolvedPersonalAvatarUrl = personalAvatarUrlProp !== undefined
    ? personalAvatarUrlProp
    : (profile?.avatar_url ?? null);
  const resolvedWorkspaceLogoUrl = workspaceLogoUrlProp !== undefined
    ? workspaceLogoUrlProp
    : (workspace?.activeWorkspace?.logo_url ?? null);
  const resolvedDriverAvatarUrl = driverAvatarUrlProp !== undefined
    ? driverAvatarUrlProp
    : null;

  // Default shape by surface
  const resolvedShape = shape ?? (surface === 'business' ? 'rounded' : 'circle');

  // KYC status for badge
  const workspaceKycStatus = workspace?.activeWorkspace?.verification_status ?? null;
  const showBadge = showVerifiedBadge && workspaceKycStatus === 'verified';

  // ── Render party avatar based on surface ────────────────────────────────────

  let avatarNode: React.ReactElement;

  if (surface === 'personal') {
    avatarNode = (
      <PartyAvatar
        party={{ type: 'user', name: resolvedName, avatarUrl: resolvedPersonalAvatarUrl }}
        context="personal"
        size={size}
        shape={resolvedShape}
        showBorder={showBorder}
      />
    );
  } else if (surface === 'business') {
    avatarNode = (
      <PartyAvatar
        party={{
          type: 'user',
          name: resolvedName,
          avatarUrl: resolvedPersonalAvatarUrl,
          orgLogoUrl: resolvedWorkspaceLogoUrl,
        }}
        context="representing_company"
        size={size}
        shape={resolvedShape}
        showBorder={showBorder}
      />
    );
  } else {
    // driver
    avatarNode = (
      <PartyAvatar
        party={{ type: 'driver', name: resolvedName, avatarUrl: resolvedDriverAvatarUrl }}
        size={size}
        shape={resolvedShape}
        showBorder={showBorder}
      />
    );
  }

  if (!showBadge) {
    return (
      <View style={style}>
        {avatarNode}
      </View>
    );
  }

  // With verified badge
  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      {avatarNode}
      <View style={styles.badge}>
        <FontAwesome name="check" size={7} color="#ffffff" />
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    backgroundColor: BADGE_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
});
