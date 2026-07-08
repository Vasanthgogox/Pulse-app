import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { useOrganization } from '@/context/OrganizationProvider';
import { fetchUserProfile, type UserProfile } from '@/lib/services/profile.service';
import { initialsFromName, resolveUserAvatarUri } from '@/lib/user-avatar';

export function useUserProfile() {
  const { user, loading: authLoading } = useAuth();
  const { profile: orgProfile, platformOrganization } = useOrganization();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setProfile(null);
      setAvatarUri(null);
      setProfileLoading(false);
      return;
    }

    let cancelled = false;
    setProfileLoading(true);

    void (async () => {
      const row = await fetchUserProfile(user.id);
      if (cancelled) return;
      setProfile(row);

      const uri = await resolveUserAvatarUri({
        avatarUrl: row?.avatar_url,
        avatarSeed: row?.avatar_seed,
      });
      if (!cancelled) {
        setAvatarUri(uri);
        setProfileLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id]);

  const displayName = useMemo(() => {
    const fromProfile = profile?.full_name?.trim();
    if (fromProfile) return fromProfile;
    const fromEmail = (profile?.email ?? user?.email ?? '').split('@')[0]?.trim();
    if (fromEmail) return fromEmail;
    return 'Pulse User';
  }, [profile?.email, profile?.full_name, user?.email]);

  const email = profile?.email ?? user?.email ?? '';
  const organizationName =
    platformOrganization?.name ?? orgProfile?.name ?? profile?.company_name ?? 'Organization';
  const initials = initialsFromName(displayName);
  const colorSeed = user?.id ?? email ?? displayName;

  return {
    user,
    profile,
    authLoading,
    profileLoading,
    isLoading: authLoading || profileLoading,
    displayName,
    email,
    organizationName,
    role: profile?.role ?? null,
    phone: profile?.phone ?? null,
    avatarUri,
    initials,
    colorSeed,
  };
}
