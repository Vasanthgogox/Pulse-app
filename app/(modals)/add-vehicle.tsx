import { useLocalSearchParams, useRouter } from 'expo-router';
import { useOrganization } from '@/contexts/OrganizationContext';
import { PartyRegistrationPortal } from '@/features/finance/components/PartyRegistrationPortal';
import { usePartyPortalRouteHandlers } from '@/features/finance/hooks/usePartyPortalRouteHandlers';
import { ROUTES } from '@/lib/routes';

const DEFAULT_FALLBACK_ROUTE = ROUTES.TABS.RESOURCES;

/** Dismiss modal: go back to the page that opened it. */
function closeModal(router: ReturnType<typeof useRouter>, returnTo?: string) {
  if (router.canGoBack()) {
    router.back();
  } else if (returnTo) {
    router.replace(returnTo as Parameters<typeof router.replace>[0]);
  } else {
    router.replace(DEFAULT_FALLBACK_ROUTE);
  }
}

export default function AddVehicleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const partyPortal = usePartyPortalRouteHandlers();
  const { currentOrganization } = useOrganization();
  const returnToParam = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const returnTo = returnToParam?.startsWith('/') ? returnToParam : undefined;

  return (
    <PartyRegistrationPortal
      visible
      initialKind="vehicle"
      onClose={() => closeModal(router, returnTo)}
      organizationId={partyPortal.organizationId}
      noOrganizationMessage={
        currentOrganization ? null : partyPortal.NO_ORG_MESSAGE
      }
      onRefreshOrganization={partyPortal.refreshOrganization}
      onAddClient={partyPortal.handleAddClientComplete}
      onAddSupplier={partyPortal.handleAddSupplierComplete}
      onAddDriver={partyPortal.handleAddDriverDirect}
      onAddVehicle={partyPortal.handleAddVehicleComplete}
    />
  );
}
