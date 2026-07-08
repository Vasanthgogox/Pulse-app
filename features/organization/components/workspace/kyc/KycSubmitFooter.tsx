import { LoadingIndicator } from '@/components/LoadingIndicator';
import Theme from '@/constants/Theme';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
};

export function KycSubmitFooter({ canSubmit, submitting, onSubmit }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.hint}>
        Submit locks your profile for review. Ensure tax IDs, required documents, and business details are complete.
      </Text>
      <Pressable
        style={[styles.btn, (!canSubmit || submitting) && styles.btnDisabled]}
        disabled={!canSubmit || submitting}
        onPress={onSubmit}
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  hint: {
    flex: 1,
    minWidth: 180,
    fontSize: 10,
    color: Theme.textMuted,
    lineHeight: 14,
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 6,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    minWidth: 160,
    alignItems: 'center',
    minHeight: 34,
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { fontSize: 12, fontWeight: '600', color: Theme.buttonPrimaryText },
});
