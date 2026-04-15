import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Theme from '@/constants/Theme';

interface PaymentTransactionRowProps {
  dateTime: string;
  balance?: string;
  youGaveAmount?: string;
  youGotAmount?: string;
  onPress?: () => void;
}

export function PaymentTransactionRow({
  dateTime,
  balance,
  youGaveAmount,
  youGotAmount,
  onPress,
}: PaymentTransactionRowProps) {
  const content = (
    <View style={styles.row}>
      <View style={styles.leftSection}>
        <Text style={styles.dateTime}>{dateTime}</Text>
        {balance != null && (
          <View style={styles.balancePill}>
            <Text style={styles.balanceText}>Bal. {balance}</Text>
          </View>
        )}
      </View>
      <View style={styles.rightSection}>
        {youGaveAmount != null && (
          <View style={styles.amountContainer}>
            <Text style={styles.youGaveAmount}>{youGaveAmount}</Text>
          </View>
        )}
        {youGotAmount != null && (
          <View style={styles.amountContainer}>
            <Text style={styles.youGotAmount}>{youGotAmount}</Text>
          </View>
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Theme.cardWhite,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  leftSection: {
    flex: 1,
  },
  dateTime: {
    fontSize: 16,
    fontWeight: '600',
    color: Theme.textPrimary,
    marginBottom: 6,
  },
  balancePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffe0e0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  balanceText: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.negative,
  },
  rightSection: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  amountContainer: {
    minWidth: 80,
    alignItems: 'flex-end',
  },
  youGaveAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: Theme.negative,
  },
  youGotAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: Theme.positive,
  },
});

