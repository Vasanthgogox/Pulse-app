import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PULSE_SIGNUP } from './signUpPulseTheme';
import { createPulseSignUpTextStyles } from './signUpTypography';

export interface SignUpOtpBoxesProps {
  digits: string;
  length: number;
  /** Fixed-width boxes centered as a group (verification step). */
  centered?: boolean;
}

const text = createPulseSignUpTextStyles(PULSE_SIGNUP);
const BOX_SIZE = 36;
const BOX_GAP = 5;

export const SignUpOtpBoxes = memo(function SignUpOtpBoxes({
  digits,
  length,
  centered = false,
}: SignUpOtpBoxesProps) {
  const chars = digits.padEnd(length, ' ').split('').slice(0, length);

  return (
    <View style={[styles.row, centered && styles.rowCentered]}>
      {chars.map((c, i) => {
        const filled = c.trim() !== '';
        const active = i === digits.length && digits.length < length;
        return (
          <View
            key={i}
            style={[
              styles.box,
              centered && styles.boxCentered,
              filled && styles.boxFilled,
              active && styles.boxActive,
            ]}
          >
            <Text style={[text.otpDigit, { color: 'transparent' }, filled && text.otpDigitFilled]}>
              {filled ? c : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    gap: 5,
    paddingVertical: 6,
    marginBottom: 6,
    width: '100%',
  },
  rowCentered: {
    alignSelf: 'center',
    justifyContent: 'center',
    gap: BOX_GAP,
    width: 'auto',
    maxWidth: '100%',
  },
  box: {
    flex: 1,
    maxWidth: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: PULSE_SIGNUP.border,
    backgroundColor: PULSE_SIGNUP.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxCentered: {
    flex: 0,
    flexShrink: 0,
    flexGrow: 0,
    flexBasis: BOX_SIZE,
    width: BOX_SIZE,
    minWidth: BOX_SIZE,
    maxWidth: BOX_SIZE,
    height: 40,
  },
  boxFilled: {
    borderColor: PULSE_SIGNUP.primaryDark,
  },
  boxActive: {
    borderColor: PULSE_SIGNUP.primaryDark,
    opacity: 0.85,
    shadowColor: PULSE_SIGNUP.primaryDark,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
});
