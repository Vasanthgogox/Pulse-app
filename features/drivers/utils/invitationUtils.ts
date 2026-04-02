/**
 * Reusable driver invitation utilities - mirrors AddDriverModal flow exactly.
 * Provides consistent invitation handling across the application.
 */
import { Alert } from 'react-native';
import type { DriverFormData } from '../components/AddDriverModal';
import { inviteDriver, resetDriverSignupInvite } from '../services/drivers.service';

/**
 * Handle driver invitation with identical flow as AddDriverModal.
 * Includes error handling, success messages, and state management.
 */
export async function handleDriverInvitation(
  formData: DriverFormData,
  orgId: string,
  orgName?: string | null,
  options?: {
    onSuccess?: (result: { inviteSent: boolean; driver?: any }) => void;
    onError?: (error: Error) => void;
    t?: (key: string) => string; // Translation function
  },
): Promise<{ inviteSent: boolean; driver?: any; error?: Error }> {
  const translator = options?.t ?? ((key: string) => key);

  try {
    // Call the same inviteDriver function used by AddDriverModal
    const result = await inviteDriver(orgId, formData, orgName);

    if (result.error) {
      // Handle duplicate invitation scenarios
      if (result.inviteAlreadyExists) {
        const statusMsg = result.inviteStatus
          ? `\n\n${translator('status')}: ${result.inviteStatus}`
          : '';

        Alert.alert(
          translator('invitationAlreadySentTitle') || 'Invitation Already Sent',
          `${translator('invitationAlreadySentBody') || 'An invitation has already been sent to this driver.'}${statusMsg}`
        );

        return { inviteSent: false, error: result.error };
      }

      // Handle other errors
      Alert.alert(
        translator('invitationFailedTitle') || 'Invitation Failed',
        result.error.message || translator('invitationFailedBody') || 'Failed to send invitation. Please try again.'
      );

      options?.onError?.(result.error);
      return { inviteSent: false, error: result.error };
    }

    // Success case
    if (result.inviteSent) {
      Alert.alert(
        translator('invitationSentTitle') || 'Invitation Sent',
        translator('invitationSentBody') || 'Driver invitation has been sent successfully.'
      );
    }

    if (result.driver) {
      options?.onSuccess?.({ inviteSent: result.inviteSent, driver: result.driver });
    }
    
    return { inviteSent: result.inviteSent, driver: result.driver };
  } catch (error: unknown) {
    const err = error as Error;
    Alert.alert(
      translator('invitationFailedTitle') || 'Invitation Failed',
      err.message || translator('invitationFailedBody') || 'An unexpected error occurred.'
    );

    options?.onError?.(err);
    return { inviteSent: false, error: err };
  }
}

/**
 * Convert existing driver data to DriverFormData format.
 * Useful for profile request flows where we want to pre-fill form data.
 */
export function createDriverFormDataFromExistingDriver(
  driver: any,
  offer?: any
): DriverFormData {
  return {
    driverSource: 'organization',
    name: driver.name || '',
    phone: driver.phone || '',
    email: driver.email || '',
    emergencyContact: '',
    emergencyName: '',
    licenseNumber: '',
    payableAmount: offer?.payableAmount || null,
    commissionPercent: offer?.commissionPercent || null,
    commissionPerKm: offer?.commissionPerKm || null,
  };
}

/**
 * Reset driver invitation status to allow re-sending.
 * Updates the signup match to "pending_owner_action" status.
 */
export async function resetDriverInvitation(
  driverId: string,
  options?: {
    onError?: (error: Error) => void;
    t?: (key: string) => string; // Translation function
  }
): Promise<{ success: boolean; error?: Error }> {
  const translator = options?.t ?? ((key: string) => key);

  try {
    // Reset invitation via dedicated RPC (with service-level fallback).
    const { error } = await resetDriverSignupInvite(driverId);
    
    if (error) {
      Alert.alert(
        translator('invitationResetFailedTitle') || 'Reset Failed',
        error.message || translator('invitationResetFailedBody') || 'Failed to reset invitation. Please try again.'
      );
      
      options?.onError?.(error);
      return { success: false, error };
    }

    // Success
    Alert.alert(
      translator('invitationResetSuccessTitle') || 'Invitation Reset',
      translator('invitationResetSuccessBody') || 'Invitation has been reset successfully. You can now send a new invitation.'
    );

    return { success: true };
    
  } catch (error) {
    const err = error as Error;
    Alert.alert(
      translator('invitationResetFailedTitle') || 'Reset Failed',
      err.message || translator('invitationResetFailedBody') || 'An unexpected error occurred.'
    );
    
    options?.onError?.(err);
    return { success: false, error: err };
  }
}
