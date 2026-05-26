/**
 * `features/auth` barrel — service-layer only.
 *
 * UI components MUST be imported from their direct file path, e.g.
 *   import { EditProfileModal } from '@/features/auth/components/EditProfileModal';
 *
 * Re-exporting a UI component here drags the modal (and its avatar picker /
 * image manipulator chain) into every consumer of `* as authService`, which
 * includes `app/_layout.tsx` — that pulled ~hundreds of KB into the startup
 * chunk for no reason.
 */
export * from './services/auth.service';

