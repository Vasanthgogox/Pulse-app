# Driver avatar icons

Ten preset driver avatars for Pulse Pilot (`assets/drivers/driver-1.png` … `driver-10.png`).

Used in:

- Driver signup avatar step (`ALL_PRESET_AVATARS` in `constants/DriverLevels.ts`)
- Driver profile edit / preset picker
- `profile.avatar_seed` → `getAvatarUriForSeed` / `resolveDriverAvatarImageSource`
- Live map driver markers

Seeds are `driver-1` … `driver-10` (stable in DB).
