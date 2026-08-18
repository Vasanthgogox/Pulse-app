import { supabase } from '@/lib/supabase';
import {
  isVerificationFrozen,
  type KycVerificationStatus,
} from '@/types/organization';

const ADDRESS_PATCH_KEYS = [
  'address_line',
  'locality',
  'pincode',
  'city',
  'state',
] as const;

async function rejectFrozenAddressWrite(
  orgId: string,
  payload: UpdateOrganizationWorkspaceProfileData,
): Promise<Error | null> {
  const touchingAddress = ADDRESS_PATCH_KEYS.some(
    (key) => payload[key] !== undefined,
  );
  if (!touchingAddress) return null;
  const { data, error } = await supabase()
    .from('organizations')
    .select('verification_status')
    .eq('id', orgId)
    .maybeSingle();
  if (error) return new Error(error.message);
  const status = (data?.verification_status ?? 'unverified') as KycVerificationStatus;
  if (!isVerificationFrozen(status)) return null;
  return new Error(
    'Registered office is locked after verification. Upload a new address proof for Pulse admin to change it.',
  );
}

export type OrganizationWorkspaceProfile = {
  id: string;
  name: string;
  address_line: string | null;
  locality: string | null;
  pincode: string | null;
  city: string | null;
  state: string | null;
  zone: string | null;
  created_at: string;
  profile_about: string | null;
  profile_website: string | null;
  profile_ceo_name: string | null;
  profile_sector: string | null;
  profile_area: string | null;
  founded_year: number | null;
  profile_facebook: string | null;
  profile_youtube: string | null;
  profile_products: string[];
};

export type UpdateOrganizationWorkspaceProfileData = {
  profile_about?: string | null;
  profile_website?: string | null;
  profile_ceo_name?: string | null;
  profile_sector?: string | null;
  profile_area?: string | null;
  founded_year?: number | null;
  profile_facebook?: string | null;
  profile_youtube?: string | null;
  profile_products?: string[];
  address_line?: string | null;
  locality?: string | null;
  pincode?: string | null;
  city?: string | null;
  state?: string | null;
};

const PROFILE_SELECT =
  'id,name,address_line,locality,pincode,city,state,zone,created_at,profile_about,profile_website,profile_ceo_name,profile_sector,profile_area,founded_year,profile_facebook,profile_youtube,profile_products';

export async function getOrganizationWorkspaceProfile(
  orgId: string,
): Promise<{ error: Error | null; profile: OrganizationWorkspaceProfile | null }> {
  const { data, error } = await supabase()
    .from('organizations')
    .select(PROFILE_SELECT)
    .eq('id', orgId)
    .maybeSingle();

  if (error) return { error: new Error(error.message), profile: null };
  if (!data) return { error: new Error('Workspace not found'), profile: null };

  const row = data as OrganizationWorkspaceProfile;
  return {
    error: null,
    profile: {
      ...row,
      profile_products: Array.isArray(row.profile_products) ? row.profile_products : [],
    },
  };
}

export async function updateOrganizationWorkspaceProfile(
  orgId: string,
  payload: UpdateOrganizationWorkspaceProfileData,
): Promise<{ error: Error | null; profile: OrganizationWorkspaceProfile | null }> {
  const frozenErr = await rejectFrozenAddressWrite(orgId, payload);
  if (frozenErr) return { error: frozenErr, profile: null };

  const patch: Record<string, unknown> = {};

  if (payload.profile_about !== undefined) {
    patch.profile_about = payload.profile_about?.trim() || null;
  }
  if (payload.profile_website !== undefined) {
    patch.profile_website = payload.profile_website?.trim() || null;
  }
  if (payload.profile_ceo_name !== undefined) {
    patch.profile_ceo_name = payload.profile_ceo_name?.trim() || null;
  }
  if (payload.profile_sector !== undefined) {
    patch.profile_sector = payload.profile_sector?.trim() || null;
  }
  if (payload.profile_area !== undefined) {
    patch.profile_area = payload.profile_area?.trim() || null;
  }
  if (payload.founded_year !== undefined) {
    patch.founded_year = payload.founded_year;
  }
  if (payload.profile_facebook !== undefined) {
    patch.profile_facebook = payload.profile_facebook?.trim() || null;
  }
  if (payload.profile_youtube !== undefined) {
    patch.profile_youtube = payload.profile_youtube?.trim() || null;
  }
  if (payload.profile_products !== undefined) {
    patch.profile_products = payload.profile_products
      .map((p) => p.trim())
      .filter(Boolean);
  }
  if (payload.address_line !== undefined) {
    patch.address_line = payload.address_line?.trim() || null;
  }
  if (payload.locality !== undefined) {
    patch.locality = payload.locality?.trim() || null;
  }
  if (payload.pincode !== undefined) {
    const digits = payload.pincode?.replace(/\D/g, '') ?? '';
    patch.pincode = digits || null;
  }
  if (payload.city !== undefined) patch.city = payload.city?.trim() || null;
  if (payload.state !== undefined) patch.state = payload.state?.trim() || null;

  const { data, error } = await supabase()
    .from('organizations')
    .update(patch)
    .eq('id', orgId)
    .select(PROFILE_SELECT)
    .maybeSingle();

  if (error) return { error: new Error(error.message), profile: null };
  if (!data) {
    return {
      error: new Error('Could not save profile. You may not have permission.'),
      profile: null,
    };
  }

  const row = data as OrganizationWorkspaceProfile;
  return {
    error: null,
    profile: {
      ...row,
      profile_products: Array.isArray(row.profile_products) ? row.profile_products : [],
    },
  };
}
