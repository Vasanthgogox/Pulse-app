import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Theme from '@/constants/Theme';

interface TransactionRowProps {
  name: string;
  dateTime: string;
  amount: string;
  amountColor?: 'green' | 'red' | 'default';
  onPress?: () => void;
}

export function TransactionRow({
  name,
  dateTime,
  amount,
  amountColor = 'default',
  onPress,
}: TransactionRowProps) {
  const amountStyle =
    amountColor === 'green' ? styles.amountGreen : amountColor === 'red' ? styles.amountRed : styles.amountDefault;

  const content = (
    <View style={styles.row}>
      <View style={styles.body}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.dateTime}>{dateTime}</Text>
      </View>
      <Text style={[styles.amount, amountStyle]}>{amount}</Text>
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
  body: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: Theme.textPrimary,
    marginBottom: 4,
  },
  dateTime: {
    fontSize: 14,
    color: Theme.textSecondary,
  },
  amount: {
    fontSize: 16,
    fontWeight: '700',
  },
  amountDefault: {
    color: Theme.textPrimary,
  },
  amountGreen: {
    color: Theme.positive,
  },
  amountRed: {
    color: Theme.negative,
  },
});

