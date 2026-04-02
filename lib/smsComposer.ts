/**
 * SMS composer — shared logic for opening the system SMS UI with prefilled recipient and body.
 * Mirrors the contact-picker pattern: availability check, then single action (compose SMS).
 * Uses expo-sms; does not read or parse the device SMS inbox (Expo does not support that).
 */
import * as SMS from 'expo-sms';

export type ComposeSmsResult =
  | { ok: true; result: 'sent' | 'cancelled' | 'unknown' }
  | { ok: false; reason: 'unavailable' | 'no_recipient'; message?: string };

/**
 * Open the system SMS app with prefilled recipient(s) and optional message body.
 * - One recipient: pass a string (e.g. "+919876543210" or "9876543210").
 * - Multiple: pass array of strings.
 * - Empty addresses → returns ok: false, reason: 'no_recipient'.
 * Availability: returns unavailable in simulator (iOS) or when SMS is not supported.
 */
export async function composeSms(
  addresses: string | string[],
  message: string = '',
  options?: SMS.SMSOptions
): Promise<ComposeSmsResult> {
  try {
    const available = await SMS.isAvailableAsync();
    if (!available) {
      return {
        ok: false,
        reason: 'unavailable',
        message: 'SMS is not available on this device.',
      };
    }

    const list = Array.isArray(addresses) ? addresses : [addresses];
    const trimmed = list.map((a) => String(a).trim()).filter(Boolean);
    if (trimmed.length === 0) {
      return { ok: false, reason: 'no_recipient', message: 'At least one recipient is required.' };
    }

    const { result } = await SMS.sendSMSAsync(trimmed, message, options);
    return { ok: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to open SMS composer';
    return { ok: false, reason: 'unavailable', message };
  }
}
