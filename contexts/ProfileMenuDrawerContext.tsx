/**
 * Global profile side drawer — opened from home header avatar and dock profile.
 */
import { ProfileMenuDrawer } from "@/components/profile/ProfileMenuDrawer";
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type ProfileMenuDrawerContextValue = {
  open: () => void;
  close: () => void;
  visible: boolean;
};

const ProfileMenuDrawerContext = createContext<ProfileMenuDrawerContextValue | null>(
  null,
);

export function ProfileMenuDrawerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  const value = useMemo(
    () => ({ open, close, visible }),
    [open, close, visible],
  );

  return (
    <ProfileMenuDrawerContext.Provider value={value}>
      {children}
      <ProfileMenuDrawer visible={visible} onClose={close} />
    </ProfileMenuDrawerContext.Provider>
  );
}

export function useProfileMenuDrawer(): ProfileMenuDrawerContextValue {
  const ctx = useContext(ProfileMenuDrawerContext);
  if (!ctx) {
    throw new Error("useProfileMenuDrawer must be used within ProfileMenuDrawerProvider");
  }
  return ctx;
}

/** Returns null when provider is not mounted (e.g. auth screens). */
export function useProfileMenuDrawerOptional(): ProfileMenuDrawerContextValue | null {
  return useContext(ProfileMenuDrawerContext);
}
