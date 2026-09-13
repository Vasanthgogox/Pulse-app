import { DriverCommerceMissionEntry } from '@/features/driver/commerce-mission/DriverCommerceMissionEntry';
import type { DriverCommerceMissionState } from '@/features/driver/commerce-mission/useDriverCommerceMission';
import { emptyDriverTripStopOrderMission } from '@/features/driver/commerce-mission/normalizeDriverTripStopOrders';
import { ROUTES } from '@/lib/routes';
import { fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockUseDriverCommerceMission = jest.fn();

jest.mock('react-native', () => jest.requireActual('react-native'));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/contexts/DriverThemeContext', () => ({
  useDriverThemeColors: () => ({
    text: '#111',
    textMuted: '#666',
    surface: '#fff',
    borderSubtle: '#ddd',
  }),
}));

jest.mock('@/features/driver/commerce-mission/useDriverCommerceMission', () => ({
  useDriverCommerceMission: (tripId: string | null) => mockUseDriverCommerceMission(tripId),
}));

function readyCommerce(tripId: string): DriverCommerceMissionState {
  return {
    status: 'ready',
    mission: {
      ...emptyDriverTripStopOrderMission(tripId),
      indentId: 'indent-1',
      executionPlanId: 'plan-1',
    },
  };
}

describe('DriverCommerceMissionEntry', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockUseDriverCommerceMission.mockReset();
  });

  it('renders CTA when Primitive A returns an execution plan', () => {
    mockUseDriverCommerceMission.mockReturnValue(readyCommerce('trip-1'));
    const { getByText, getByTestId } = render(<DriverCommerceMissionEntry tripId="trip-1" />);
    expect(getByTestId('commerce-mission-entry')).toBeTruthy();
    expect(getByText('Delivery Mission')).toBeTruthy();
    expect(getByText('View orders')).toBeTruthy();
  });

  it('renders nothing when the mission has no Commerce plan', () => {
    mockUseDriverCommerceMission.mockReturnValue({
      status: 'ready',
      mission: emptyDriverTripStopOrderMission('trip-core'),
    });
    const { queryByTestId } = render(<DriverCommerceMissionEntry tripId="trip-core" />);
    expect(queryByTestId('commerce-mission-entry')).toBeNull();
  });

  it('renders nothing while loading', () => {
    mockUseDriverCommerceMission.mockReturnValue({
      status: 'loading',
      mission: emptyDriverTripStopOrderMission('trip-1'),
    });
    const { queryByTestId } = render(<DriverCommerceMissionEntry tripId="trip-1" />);
    expect(queryByTestId('commerce-mission-entry')).toBeNull();
  });

  it('renders nothing on RPC error', () => {
    mockUseDriverCommerceMission.mockReturnValue({
      status: 'error',
      mission: emptyDriverTripStopOrderMission('trip-1'),
      error: new Error('permission denied for function get_driver_trip_stop_orders'),
    });
    const { queryByTestId, queryByText } = render(
      <DriverCommerceMissionEntry tripId="trip-1" />,
    );
    expect(queryByTestId('commerce-mission-entry')).toBeNull();
    expect(queryByText(/permission denied/i)).toBeNull();
  });

  it('navigates to the read-only Commerce mission route', () => {
    mockUseDriverCommerceMission.mockReturnValue(readyCommerce('trip-9'));
    const { getByTestId } = render(<DriverCommerceMissionEntry tripId="trip-9" />);
    fireEvent.press(getByTestId('commerce-mission-entry'));
    expect(mockPush).toHaveBeenCalledWith(ROUTES.driverCommerceMission('trip-9'));
  });
});
