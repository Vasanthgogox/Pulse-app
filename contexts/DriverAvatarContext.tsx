/**
 * Persisted avatar seed for driver app (reference: Visual Verification / Select Avatar Node).
 * Ensures avatar image is never blank; default 'driver-1'.
 */
import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

const STORAGE_KEY = 'driver_avatar_seed';
const DEFAULT_SEED = 'driver-1';

type DriverAvatarContextType = {
  avatarSeed: string;
  setAvatarSeed: (seed: string) => void;
};

const DriverAvatarContext = createContext<DriverAvatarContextType | undefined>(undefined);

export function useDriverAvatar() {
  const ctx = useContext(DriverAvatarContext);
  if (!ctx) throw new Error('useDriverAvatar must be used within DriverAvatarProvider');
  return ctx;
}

export function DriverAvatarProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [avatarSeed, setAvatarSeedState] = useState(DEFAULT_SEED);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // 1. Try DB profile first (if signed in)
    if (profile?.avatar_seed) {
      setAvatarSeedState(profile.avatar_seed);
      setHydrated(true);
      return;
    }

    // 2. Fallback to AsyncStorage for guest/offline or if not in DB yet
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) setAvatarSeedState(stored);
      setHydrated(true);
    });
  }, [profile?.avatar_seed]);

  const setAvatarSeed = (seed: string) => {
    setAvatarSeedState(seed);
    AsyncStorage.setItem(STORAGE_KEY, seed);
    // Note: EditProfileModal handles the authService.updateProfile(avatar_seed) call
  };

  return (
    <DriverAvatarContext.Provider value={{ avatarSeed: hydrated ? avatarSeed : DEFAULT_SEED, setAvatarSeed }}>
      {children}
    </DriverAvatarContext.Provider>
  );
}
