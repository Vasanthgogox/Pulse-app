export type UserAvatarPreset = {
  seed: string;
  name: string;
};

/**
 * 2D avatar presets for non-driver users.
 * Uses DiceBear "avataaars" which is already used across the app for network/user avatars.
 */
export const USER_2D_AVATARS: UserAvatarPreset[] = [
  { seed: "pilot-1", name: "Pilot 01" },
  { seed: "pilot-2", name: "Pilot 02" },
  { seed: "pilot-3", name: "Pilot 03" },
  { seed: "pilot-4", name: "Pilot 04" },
  { seed: "pilot-5", name: "Pilot 05" },
  { seed: "pilot-6", name: "Pilot 06" },
  { seed: "pilot-7", name: "Pilot 07" },
  { seed: "pilot-8", name: "Pilot 08" },
  { seed: "pilot-9", name: "Pilot 09" },
  { seed: "pilot-10", name: "Pilot 10" },
  { seed: "pilot-11", name: "Pilot 11" },
  { seed: "pilot-12", name: "Pilot 12" },
];

export const DEFAULT_USER_2D_AVATAR_SEED = USER_2D_AVATARS[0]?.seed ?? "pilot-1";

export function getUser2DAvatarUriForSeed(seed: string): string {
  const safeSeed = encodeURIComponent(
    (seed ?? "").trim() || DEFAULT_USER_2D_AVATAR_SEED,
  );
  return `https://api.dicebear.com/7.x/avataaars/png?seed=${safeSeed}`;
}

