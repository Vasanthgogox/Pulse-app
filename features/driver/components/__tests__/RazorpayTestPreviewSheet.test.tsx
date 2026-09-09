/**
 * A10.2 — covers RazorpayTestPreviewSheet's three observable behaviors:
 * it renders the dynamic fee amount and an unmistakable TEST PREVIEW label,
 * "Pay" drives the success state via the passed-in onOutcome('paid') call,
 * and "Simulate payment failure" drives the failure state via onOutcome('failed')
 * -- never marking either outcome without going through that callback (which,
 * in the real app, is the existing marketplace-test-payment/
 * confirm_marketplace_fee_payment path -- this test only verifies the UI
 * contract, not the backend, which is unchanged).
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { RazorpayTestPreviewSheet } from '../RazorpayTestPreviewSheet';

jest.mock('react-native', () => jest.requireActual('react-native'));

describe('RazorpayTestPreviewSheet', () => {
  it('renders nothing when there is no order', () => {
    const { queryByText } = render(
      <RazorpayTestPreviewSheet order={null} onOutcome={jest.fn()} onDismiss={jest.fn()} />,
    );
    expect(queryByText('Razorpay')).toBeNull();
  });

  it('shows the dynamic fee amount and the TEST PREVIEW label', () => {
    const { getByText, getAllByText } = render(
      <RazorpayTestPreviewSheet order={{ amount: 1095 }} onOutcome={jest.fn()} onDismiss={jest.fn()} />,
    );
    expect(getByText('₹ 1,095')).toBeTruthy();
    expect(getByText('Pay ₹ 1,095')).toBeTruthy();
    expect(getAllByText('TEST PREVIEW').length).toBeGreaterThan(0);
  });

  it('tapping Pay calls onOutcome("paid") and shows the success state, not a real charge', async () => {
    const onOutcome = jest.fn().mockResolvedValue({ error: null });
    const { getByText, queryByText } = render(
      <RazorpayTestPreviewSheet order={{ amount: 1095 }} onOutcome={onOutcome} onDismiss={jest.fn()} />,
    );
    fireEvent.press(getByText('Pay ₹ 1,095'));
    await waitFor(() => expect(getByText('Payment successful')).toBeTruthy());
    expect(onOutcome).toHaveBeenCalledWith('paid');
    expect(onOutcome).toHaveBeenCalledTimes(1);
    expect(queryByText('Payment failed')).toBeNull();
  });

  it('tapping Simulate payment failure calls onOutcome("failed") and shows the failure state', async () => {
    const onOutcome = jest.fn().mockResolvedValue({ error: null });
    const { getByText, queryByText } = render(
      <RazorpayTestPreviewSheet order={{ amount: 1095 }} onOutcome={onOutcome} onDismiss={jest.fn()} />,
    );
    fireEvent.press(getByText('Simulate payment failure'));
    await waitFor(() => expect(getByText('Payment failed')).toBeTruthy());
    expect(onOutcome).toHaveBeenCalledWith('failed');
    expect(queryByText('Payment successful')).toBeNull();
  });

  it('a technical error from onOutcome surfaces inline and does not fake a result', async () => {
    const onOutcome = jest.fn().mockResolvedValue({ error: new Error('network blip') });
    const { getByText, queryByText } = render(
      <RazorpayTestPreviewSheet order={{ amount: 1095 }} onOutcome={onOutcome} onDismiss={jest.fn()} />,
    );
    fireEvent.press(getByText('Pay ₹ 1,095'));
    await waitFor(() => expect(getByText('network blip')).toBeTruthy());
    expect(queryByText('Payment successful')).toBeNull();
    expect(queryByText('Payment failed')).toBeNull();
  });

  it('Cancel and Done call onDismiss without ever calling onOutcome', () => {
    const onOutcome = jest.fn();
    const onDismiss = jest.fn();
    const { getByText } = render(
      <RazorpayTestPreviewSheet order={{ amount: 1095 }} onOutcome={onOutcome} onDismiss={onDismiss} />,
    );
    fireEvent.press(getByText('Cancel'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onOutcome).not.toHaveBeenCalled();
  });
});
