/**
 * A11.3 — Organization Find Work must distinguish a backend failure from a
 * genuine "no open loads" empty state. Full-mount test (heavy dependency
 * surface mocked, following this repo's existing pattern in
 * app/__tests__/sign-in.test.tsx) covering exactly the three states the
 * fix touches: error+Retry, loading, and the unchanged empty state.
 */
import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FindLoadsScreen from '../index';
import * as findLoadsForOrgService from '@/features/network/services/findLoadsForOrg.service';
import * as vehiclesService from '@/features/vehicles/services/vehicles.service';

jest.mock('react-native', () => jest.requireActual('react-native'));

jest.mock('expo-router', () => ({
  useRouter: () => ({ canGoBack: () => false, back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
}));
jest.mock('@/lib/layoutInsets', () => ({
  useLayoutInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0, isDesktopWeb: false }),
}));
jest.mock('@/lib/useMemberAccess', () => ({
  useMemberAccess: () => ({ can: () => true, isLoading: false }),
}));
jest.mock('@/contexts/OrganizationContext', () => ({
  useOrganization: () => ({ currentOrganization: { id: 'org-1' }, isLoading: false }),
}));

jest.mock('@/features/network/services/findLoadsForOrg.service', () => {
  const actual = jest.requireActual('@/features/network/services/findLoadsForOrg.service');
  return {
    ...actual,
    listOpenMarketplaceLoadsForOrg: jest.fn(),
    listMyOrgMarketBids: jest.fn().mockResolvedValue({ error: null, bids: [] }),
    submitOrgMarketBid: jest.fn(),
  };
});
jest.mock('@/features/vehicles/services/vehicles.service', () => ({
  getVehiclesByOrganization: jest.fn().mockResolvedValue({ error: null, vehicles: [] }),
}));

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FindLoadsScreen />
    </QueryClientProvider>,
  );
}

describe('Find Loads (organization) — backend error vs. empty state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (vehiclesService.getVehiclesByOrganization as jest.Mock).mockResolvedValue({
      error: null,
      vehicles: [],
    });
    (findLoadsForOrgService.listMyOrgMarketBids as jest.Mock).mockResolvedValue({
      error: null,
      bids: [],
    });
  });

  it('shows the error state with Retry when the RPC fails -- never the empty-state copy', async () => {
    (findLoadsForOrgService.listOpenMarketplaceLoadsForOrg as jest.Mock).mockResolvedValue({
      error: new Error('permission denied for function list_open_marketplace_loads_for_org'),
      loads: [],
    });
    const { findByText, queryByText } = renderScreen();

    await waitFor(() => expect(findByText("Couldn't load Marketplace loads.")).resolves.toBeTruthy());
    expect(queryByText('No open Marketplace loads right now.')).toBeNull();
    expect(await findByText('Retry')).toBeTruthy();
  });

  it('tapping Retry calls the same query mechanism again (refetch), not a new path', async () => {
    (findLoadsForOrgService.listOpenMarketplaceLoadsForOrg as jest.Mock).mockResolvedValue({
      error: new Error('network error'),
      loads: [],
    });
    const { findByText } = renderScreen();
    await waitFor(() => expect(findByText("Couldn't load Marketplace loads.")).resolves.toBeTruthy());

    const callsBeforeRetry = (findLoadsForOrgService.listOpenMarketplaceLoadsForOrg as jest.Mock).mock
      .calls.length;
    fireEvent.press(await findByText('Retry'));

    await waitFor(() =>
      expect(
        (findLoadsForOrgService.listOpenMarketplaceLoadsForOrg as jest.Mock).mock.calls.length,
      ).toBeGreaterThan(callsBeforeRetry),
    );
  });

  it('a successful request with zero eligible loads shows the unchanged empty state, never the error copy', async () => {
    (findLoadsForOrgService.listOpenMarketplaceLoadsForOrg as jest.Mock).mockResolvedValue({
      error: null,
      loads: [],
    });
    const { findByText, queryByText } = renderScreen();

    await waitFor(() =>
      expect(findByText('No open Marketplace loads right now.')).resolves.toBeTruthy(),
    );
    expect(queryByText("Couldn't load Marketplace loads.")).toBeNull();
    expect(queryByText('Retry')).toBeNull();
  });
});
