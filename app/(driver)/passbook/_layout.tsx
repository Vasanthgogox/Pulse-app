/**
 * Passbook segment layout — Stack so dynamic route passbook/[orgId] works when pushed from Requests.
 * Fixes "No route named passbook" by giving the passbook segment a proper layout.
 */
import { Stack } from 'expo-router';

export default function PassbookLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
