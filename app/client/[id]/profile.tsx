import { ROUTES } from '@/lib/routes';
import { Redirect, useLocalSearchParams, type Href } from 'expo-router';

/** @deprecated Use `/party/customers/[id]` — kept for bookmarks and deep links. */
export default function ClientProfileLegacyRedirect() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const clientId = typeof id === 'string' ? id : id?.[0] ?? '';
  const initialTab = typeof tab === 'string' ? tab : undefined;

  if (!clientId) {
    return <Redirect href={ROUTES.partyDirectory('customers')} />;
  }

  return (
    <Redirect href={ROUTES.clientProfile(clientId, initialTab) as Href} />
  );
}
