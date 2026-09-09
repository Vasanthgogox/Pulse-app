/**
 * A11.1 — BidConfirmModal's marketplaceFee prop is optional and additive.
 * Covers: the fee block renders only when the prop is supplied (so
 * Reach/relationship callers, which never pass it, are unaffected), the
 * active/inactive states render the right copy, and loading/error never
 * render a fee line (never silently show ₹0).
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { BidConfirmModal } from '../BidConfirmModal';

jest.mock('react-native', () => jest.requireActual('react-native'));

// moti ships ESM and isn't in this project's jest transformIgnorePatterns
// allowlist (a pre-existing gap, unrelated to this change) -- stubbed here,
// scoped to this test file only, as a plain View passthrough.
jest.mock('moti', () => {
  const { View } = jest.requireActual('react-native');
  return { MotiView: View };
});

const baseProps = {
  visible: true,
  phase: 'review' as const,
  amount: 36500,
  ownerName: 'Test Shipper',
  onCancel: jest.fn(),
  onConfirm: jest.fn(),
};

describe('BidConfirmModal — marketplace fee preview', () => {
  it('renders no fee text at all when marketplaceFee is omitted (Reach/relationship callers)', () => {
    const { queryByText } = render(<BidConfirmModal {...baseProps} />);
    expect(queryByText(/Marketplace fee/i)).toBeNull();
    expect(queryByText(/You pay Pulse/i)).toBeNull();
    expect(queryByText(/No platform fee/i)).toBeNull();
  });

  it('shows bid amount, fee amount, and "you pay Pulse" copy when active', () => {
    const { getByText, getAllByText } = render(
      <BidConfirmModal
        {...baseProps}
        marketplaceFee={{ status: 'active', amount: 1095, capped: false }}
      />,
    );
    expect(getByText('Your bid')).toBeTruthy();
    // The hero amount above also shows ₹ 36,500 -- expect it in both places.
    expect(getAllByText('₹ 36,500').length).toBeGreaterThanOrEqual(2);
    expect(getByText('Marketplace fee')).toBeTruthy();
    expect(getByText('₹ 1,095')).toBeTruthy();
    expect(getByText(/You pay Pulse ₹ 1,095 separately/)).toBeTruthy();
  });

  it('labels a capped fee explicitly', () => {
    const { getByText } = render(
      <BidConfirmModal
        {...baseProps}
        marketplaceFee={{ status: 'active', amount: 1000, capped: true }}
      />,
    );
    expect(getByText('Marketplace fee (capped)')).toBeTruthy();
  });

  it('shows a neutral no-fee note when inactive, never ₹0', () => {
    const { getByText, queryByText } = render(
      <BidConfirmModal {...baseProps} marketplaceFee={{ status: 'inactive' }} />,
    );
    expect(getByText('No platform fee currently applies')).toBeTruthy();
    expect(queryByText('₹ 0')).toBeNull();
  });

  it('renders no fee line while loading or on error, and never blocks confirm', () => {
    for (const status of ['loading', 'error'] as const) {
      const { queryByText, getByLabelText } = render(
        <BidConfirmModal {...baseProps} marketplaceFee={{ status }} />,
      );
      expect(queryByText(/Marketplace fee/i)).toBeNull();
      expect(queryByText(/No platform fee/i)).toBeNull();
      // Confirm action remains present/enabled regardless of fee-calc state.
      expect(getByLabelText('Confirm bid')).toBeTruthy();
    }
  });
});
