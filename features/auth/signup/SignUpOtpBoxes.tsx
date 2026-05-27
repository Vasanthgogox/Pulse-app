import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/design-system/colors';
import { space } from '@/design-system/spacing';
import { SIGNUP_MOBILE_TOKENS as T } from './signUpMobileTokens';

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
            <Text style={styles.digit}>{filled ? c : ''}</Text>
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
    gap: T.otpGap,
    paddingVertical: space[2],
  },
  box: {
    width: T.otpBoxW,
    height: T.otpBoxH,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxFilled: {
    borderColor: colors.brand,
    backgroundColor: '#f0fdf4',
  },
  boxActive: {
    borderColor: colors.brand,
    borderWidth: 1.5,
  },
  digit: {
    fontSize: T.otpDigitSize,
    fontWeight: '700',
    color: colors.textPrimary,
  },
});
