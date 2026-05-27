import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PULSE_SIGNUP } from './signUpPulseTheme';

export interface SignUpOtpBoxesProps {
  digits: string;
  length: number;
}

export const SignUpOtpBoxes = memo(function SignUpOtpBoxes({
  digits,
  length,
}: SignUpOtpBoxesProps) {
  const chars = digits.padEnd(length, ' ').split('').slice(0, length);

  return (
    <View style={styles.row}>
      {chars.map((c, i) => {
        const filled = c.trim() !== '';
        const active = i === digits.length && digits.length < length;
        return (
          <View
            key={i}
            style={[
              styles.box,
              filled && styles.boxFilled,
              active && styles.boxActive,
            ]}
          >
            <Text style={[styles.digit, filled && styles.digitFilled]}>{filled ? c : ''}</Text>
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignSelf: 'stretch',
    gap: 8,
    paddingVertical: 8,
    marginBottom: 8,
  },
  box: {
    width: 48,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: PULSE_SIGNUP.border,
    backgroundColor: PULSE_SIGNUP.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxFilled: {
    borderColor: PULSE_SIGNUP.primary,
  },
  boxActive: {
    borderColor: PULSE_SIGNUP.primary,
    opacity: 0.65,
    shadowColor: PULSE_SIGNUP.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  digit: {
    fontSize: 20,
    fontWeight: '900',
    color: 'transparent',
  },
  digitFilled: {
    color: PULSE_SIGNUP.primary,
  },
});
