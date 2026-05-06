/**
 * O(n) Driver Matching Service
 * Matches new user signups to existing offline driver records using hash map for optimal performance.
 */

import { supabase } from '@/lib/supabase';
import type { DriverRow } from './drivers.service';

export interface NewUser {
  id: string;
  phone: string;
  name?: string;
  email?: string;
}

export interface DriverMatchResult {
  driverId: string;
  userId: string;
  organizationId: string;
  matched: boolean;
}

/**
 * Link offline drivers to new users in O(n) time complexity using hash map.
 * This function should be called when new users sign up to automatically link them
 * to existing offline driver records.
 * 
 * @param newUsers - Array of newly signed up users
 * @param organizationId - Organization to match drivers for
 * @returns Array of match results
 */
export async function linkOfflineDriversToNewUsers(
  newUsers: NewUser[],
  organizationId?: string
): Promise<{ error: Error | null; results: DriverMatchResult[] }> {
  try {
    // Step 1: Fetch all offline drivers (O(n) time)
    const { data: offlineDrivers, error } = await supabase()
      .from('drivers')
      .select('*')
      .eq('status', 'offline')
      .is('user_id', null)
      .eq(organizationId ? 'organization_id' : 'organization_id', organizationId || supabase().rpc('get_current_organization_id'))
      .limit(500);

    if (error) {
      return { error: new Error(error.message), results: [] };
    }

    // Step 2: Build hash map using phone number as key (O(n) time, O(n) space)
    const offlineDriverMap = new Map<string, DriverRow>();
    for (const driver of offlineDrivers || []) {
      if (driver.phone) {
        const normalizedPhone = normalizePhone(driver.phone);
        offlineDriverMap.set(normalizedPhone, driver);
      }
    }

    const results: DriverMatchResult[] = [];

    // Step 3: Iterate through new users once (O(n) time)
    for (const user of newUsers) {
      const normalizedUserPhone = normalizePhone(user.phone);
      const matchingOfflineDriver = offlineDriverMap.get(normalizedUserPhone);

      if (matchingOfflineDriver) {
        // Step 4: Match found! Prepare the update to link the user_id
        const updatePayload = {
          user_id: user.id,
          status: 'active' as const,
          updated_at: new Date().toISOString(),
          // Preserve existing compensation data from offline driver record
          payable_amount: matchingOfflineDriver.payable_amount,
          commission_percent: matchingOfflineDriver.commission_percent,
          commission_per_km: matchingOfflineDriver.commission_per_km,
        };

        const { error: updateError } = await supabase()
          .from('drivers')
          .update(updatePayload)
          .eq('id', matchingOfflineDriver.id);

        if (!updateError) {
          results.push({
            driverId: matchingOfflineDriver.id,
            userId: user.id,
            organizationId: matchingOfflineDriver.organization_id,
            matched: true,
          });
        }
      }
    }

    return { error: null, results };
  } catch (err) {
    return { 
      error: err instanceof Error ? err : new Error('Unknown error in driver matching'), 
      results: [] 
    };
  }
}

/**
 * Normalize phone number for consistent matching
 */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').replace(/^91/, '').slice(-10);
}

/**
 * Get unmatched offline drivers for manual review
 */
export async function getUnmatchedOfflineDrivers(
  organizationId?: string
): Promise<{ error: Error | null; drivers: DriverRow[] }> {
  const { data, error } = await supabase()
    .from('drivers')
    .select('*')
    .eq('status', 'offline')
    .is('user_id', null)
    .eq(organizationId ? 'organization_id' : 'organization_id', organizationId || supabase().rpc('get_current_organization_id'))
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    return { error: new Error(error.message), drivers: [] };
  }

  return { error: null, drivers: (data || []) as DriverRow[] };
}

/**
 * Manual driver linking for edge cases where automatic matching fails
 */
export async function manuallyLinkDriver(
  driverId: string,
  userId: string
): Promise<{ error: Error | null; success: boolean }> {
  const { error } = await supabase()
    .from('drivers')
    .update({
      user_id: userId,
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', driverId);

  if (error) {
    return { error: new Error(error.message), success: false };
  }

  return { error: null, success: true };
}
