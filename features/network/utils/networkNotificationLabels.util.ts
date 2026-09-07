import type { NetworkNotificationEventType } from '@/features/network/services/networkNotifications.service';

/** Primary CTA per network lifecycle event. */
export function networkNotificationActionLabel(
  eventType: NetworkNotificationEventType,
): string {
  if (eventType === 'indent_created') return 'Place bid';
  if (eventType === 'bid_received') return 'Review bid';
  if (eventType === 'awarded') return 'View award';
  if (eventType === 'quote_requested') return 'Send quote';
  return 'Review offer';
}

/** Short tag shown on the card. */
export function networkNotificationTagLabel(
  eventType: NetworkNotificationEventType,
): string {
  if (eventType === 'indent_created') return 'New load';
  if (eventType === 'bid_received') return 'Bid';
  if (eventType === 'awarded') return 'Awarded';
  if (eventType === 'quote_requested') return 'Quote request';
  return 'Counter offer';
}

/** Verb used in the "<actor> <verb> <highlight>" card headline. */
export function networkNotificationActionText(
  eventType: NetworkNotificationEventType,
): string {
  if (eventType === 'indent_created') return 'posted';
  if (eventType === 'bid_received') return 'quoted';
  if (eventType === 'awarded') return 'awarded';
  if (eventType === 'quote_requested') return 'requested';
  return 'countered';
}
