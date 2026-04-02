import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Theme from '@/constants/Theme';

type AmountColorOption = 'green' | 'red' | 'default';

interface SummaryCardProps {
  title: string;
  leftLabel?: string;
  leftAmount?: string;
  leftSubLabel?: string;
  rightLabel?: string;
  rightAmount?: string;
  rightSubLabel?: string;
  onRightPress?: () => void;
  amountColor?: AmountColorOption;
  /** When set, left column (subLabel + amount) uses this color instead of amountColor */
  leftAmountColor?: AmountColorOption;
  /** When set, right column (subLabel + amount) uses this color instead of amountColor */
  rightAmountColor?: AmountColorOption;
}

function getAmountStyle(color: AmountColorOption = 'default') {
  return color === 'green' ? styles.amountPositive : color === 'red' ? styles.amountNegative : styles.amountDefault;
}
function getSubLabelStyle(color: AmountColorOption = 'default') {
  return color === 'green' ? styles.subLabelPositive : color === 'red' ? styles.subLabelNegative : styles.subLabelDefault;
}

export function SummaryCard({
  title,
  leftAmount,
  leftSubLabel,
  rightAmount,
  rightSubLabel,
  onRightPress,
  amountColor = 'default',
  leftAmountColor,
  rightAmountColor,
}: SummaryCardProps) {
  const leftColor = leftAmountColor ?? amountColor;
  const rightColor = rightAmountColor ?? amountColor;
  const leftAmountStyle = getAmountStyle(leftColor);
  const leftSubLabelStyle = getSubLabelStyle(leftColor);
  const rightAmountStyle = getAmountStyle(rightColor);
  const rightSubLabelStyle = getSubLabelStyle(rightColor);

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.label}>{title}</Text>
          {leftSubLabel != null && (
            <Text style={[styles.sublabel, leftSubLabelStyle]}>{leftSubLabel}</Text>
          )}
          {leftAmount != null && (
            <Text style={[styles.amount, leftAmountStyle]}>{leftAmount}</Text>
          )}
        </View>
        {onRightPress && (
          <TouchableOpacity onPress={onRightPress} hitSlop={8} style={styles.chevronBtn}>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}
      </View>

      {(rightAmount != null || rightSubLabel != null) && (
        <View style={styles.divider}>
          <View>
            {rightSubLabel != null && (
              <Text style={[styles.sublabel, rightSubLabelStyle]}>{rightSubLabel}</Text>
            )}
            {rightAmount != null && (
              <Text style={[styles.amountSmall, rightAmountStyle]}>{rightAmount}</Text>
            )}
          </View>
          {onRightPress && (
            <View style={styles.arrowBadge}>
              <Text style={styles.arrowIcon}>↗</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.surfaceLight,
    borderRadius: 4,
    padding: 16,
    marginHorizontal: 20,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  amount: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: Theme.textBody,
  },
  chevronBtn: {
    padding: 4,
  },
  chevron: {
    fontSize: 16,
    color: Theme.textSection,
    fontWeight: '600',
  },
  divider: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  sublabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  subLabelDefault: {
    color: Theme.textMutedDemo,
  },
  subLabelPositive: {
    color: Theme.positive,
  },
  subLabelNegative: {
    color: Theme.negative,
  },
  amountSmall: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.textBody,
  },
  amountDefault: {
    color: Theme.textBody,
  },
  amountPositive: {
    color: Theme.positive,
  },
  amountNegative: {
    color: Theme.negative,
  },
  arrowBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Theme.positiveMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowIcon: {
    fontSize: 14,
    color: Theme.positive,
    fontWeight: '700',
  },
});
