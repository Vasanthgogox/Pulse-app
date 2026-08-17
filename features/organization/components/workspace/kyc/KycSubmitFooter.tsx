import { LoadingIndicator } from '@/components/LoadingIndicator';
import Theme from '@/constants/Theme';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
  /** What still blocks submit — shown when disabled so the button is not a silent pass. */
  missingItems?: string[];
  /** e.g. "Private Limited" — title becomes structure-aware. */
  structureLabel?: string | null;
  /** One-line reminder of the matrix for this structure. */
  structureHint?: string | null;
  /** Shown when ready to submit instead of the structure hint. */
  confirmCopy?: string;
};

export function KycSubmitFooter({
  canSubmit,
  submitting,
  onSubmit,
  missingItems = [],
  structureLabel,
  structureHint,
  confirmCopy,
}: Props) {
  const showGaps = !canSubmit && !submitting && missingItems.length > 0;
  const gapsTitle = structureLabel
    ? `For ${structureLabel}, still needed`
    : 'Still needed before submit';

  return (
    <View style={styles.wrap}>
      {showGaps ? (
        <View style={styles.gapsBox}>
          <Text style={styles.gapsTitle}>{gapsTitle}</Text>
          <Text style={styles.structureHint}>
            These items are required for your business structure before submit:
          </Text>
          {missingItems.map((item) => (
            <Text key={item} style={styles.gapItem}>
              • {item}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={styles.hint}>
          {confirmCopy
            ? confirmCopy
            : structureHint
              ? structureHint
              : 'Submit locks your profile for review. Ensure tax IDs, required documents, and business details are complete.'}
        </Text>
      )}
      <Pressable
        style={[styles.btn, (!canSubmit || submitting) && styles.btnDisabled]}
        disabled={!canSubmit || submitting}
        onPress={onSubmit}
        accessibilityState={{ disabled: !canSubmit || submitting }}
      >
        {submitting ? (
          <LoadingIndicator size="small" color={Theme.buttonPrimaryText} />
        ) : (
          <Text style={styles.btnText}>Submit for verification</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  hint: {
    fontSize: 10,
    color: Theme.textMuted,
    lineHeight: 14,
  },
  gapsBox: {
    gap: 3,
    paddingVertical: 2,
  },
  gapsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    marginBottom: 2,
  },
  structureHint: {
    fontSize: 10,
    color: Theme.textSecondary,
    lineHeight: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  gapItem: {
    fontSize: 10,
    color: Theme.textMuted,
    lineHeight: 14,
    fontWeight: '500',
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 6,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    minWidth: 160,
    alignSelf: 'flex-end',
    alignItems: 'center',
    minHeight: 34,
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { fontSize: 12, fontWeight: '600', color: Theme.buttonPrimaryText },
});
