import { Text, StyleSheet, Alert } from 'react-native';
import { PaymentCaptureLayout } from '@/components/layout/PaymentCaptureLayout';
import { PaymentTransactionRow } from '@/components/display/PaymentTransactionRow';
import { formatINR } from '@/lib/format';
import Theme from '@/constants/Theme';
import { usePreventScreenCapture } from '@/lib/usePreventScreenCapture';

// Sample transaction data - replace with actual data from your service
const sampleTransactions = [
  {
    id: '1',
    dateTime: '29 Dec 25 • 05:11 PM',
    balance: '₹50,000',
    youGotAmount: '₹50,000',
  },
  {
    id: '2',
    dateTime: '29 Dec 25 • 05:11 PM',
    balance: '₹1,00,000',
    youGaveAmount: '₹75,000',
  },
  {
    id: '3',
    dateTime: '29 Dec 25 • 05:09 PM',
    balance: '₹25,000',
    youGaveAmount: '₹25,000',
  },
];

export default function PaymentDetailScreen() {
  usePreventScreenCapture();
  const contactName = 'idrees'; // This would come from route params or context

  // Calculate totals
  const youGaveTotal = sampleTransactions
    .filter((t) => t.youGaveAmount)
    .reduce((sum, t) => sum + parseInt((t.youGaveAmount || '0').replace(/[₹,]/g, '')), 0);
  const youGotTotal = sampleTransactions
    .filter((t) => t.youGotAmount)
    .reduce((sum, t) => sum + parseInt((t.youGotAmount || '0').replace(/[₹,]/g, '')), 0);
  const netBalance = youGotTotal - youGaveTotal;

  return (
    <PaymentCaptureLayout
      contactName={contactName}
      summaryTitle={netBalance >= 0 ? 'You will get' : 'You will give'}
      summaryAmount={formatINR(Math.abs(netBalance))}
      summaryAmountColor={netBalance >= 0 ? 'green' : 'red'}
      youWillGiveLabel="You'll Give"
      youWillGiveAmount={youGaveTotal > 0 ? formatINR(youGaveTotal) : undefined}
      addContactHint="Add customer contact to send reminders"
      onAddContactPress={() => {
        Alert.alert('Add Contact', 'Add contact functionality');
      }}
      onSettingsPress={() => {
        Alert.alert('Settings', 'Contact settings');
      }}
      onCallPress={() => {
        Alert.alert('Call', 'Call functionality');
      }}
      onMenuPress={() => {
        Alert.alert('Menu', 'More options');
      }}
      onReportPress={() => {
        Alert.alert('Report', 'Generate PDF report');
      }}
      onRemindersPress={() => {
        Alert.alert('Reminders', 'Send reminders');
      }}
      onSmsPress={() => {
        Alert.alert('SMS', 'Send SMS');
      }}
      onYouGavePress={() => {
        Alert.alert('You Gave', 'Capture payment - You gave');
      }}
      onYouGotPress={() => {
        Alert.alert('You Got', 'Capture payment - You got');
      }}
    >
      {sampleTransactions.length === 0 ? (
        <Text style={styles.empty}>No transactions yet.</Text>
      ) : (
        sampleTransactions.map((transaction) => (
          <PaymentTransactionRow
            key={transaction.id}
            dateTime={transaction.dateTime}
            balance={transaction.balance}
            youGaveAmount={transaction.youGaveAmount}
            youGotAmount={transaction.youGotAmount}
          />
        ))
      )}
    </PaymentCaptureLayout>
  );
}

const styles = StyleSheet.create({
  empty: {
    padding: 24,
    textAlign: 'center',
    color: Theme.textSecondary,
    fontSize: 16,
  },
});

