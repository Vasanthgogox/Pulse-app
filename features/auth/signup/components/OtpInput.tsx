import { useRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { C } from '../businessSignUp.styles';
import { OTP_LENGTH } from '../signUpConstants';
import { SIGNUP_TEXT } from '../signUpTypography';

export function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const digits = value.padEnd(OTP_LENGTH, ' ').split('').slice(0, OTP_LENGTH);
  const refs = useRef<(TextInput | null)[]>([]);

  const handleChange = (idx: number, char: string) => {
    const clean = char.replace(/\D/g, '');
    if (!clean) {
      const next = value.slice(0, idx) + value.slice(idx + 1);
      onChange(next.padEnd(Math.max(0, idx), ' ').trimEnd());
      if (idx > 0) refs.current[idx - 1]?.focus();
      return;
    }
    const d = clean[clean.length - 1];
    const next = value.slice(0, idx) + d + value.slice(idx + 1);
    onChange(next.slice(0, OTP_LENGTH));
    if (idx < OTP_LENGTH - 1) refs.current[idx + 1]?.focus();
  };

  return (
    <View style={otpStyles.row}>
      {Array.from({ length: OTP_LENGTH }).map((_, i) => {
        const filled = digits[i].trim() !== '';
        return (
          <TextInput
            key={i}
            ref={r => { refs.current[i] = r; }}
            style={[otpStyles.box, filled && otpStyles.boxFilled]}
            value={filled ? digits[i] : ''}
            onChangeText={t => handleChange(i, t)}
            keyboardType="number-pad"
            maxLength={1}
            selectTextOnFocus
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === 'Backspace' && !digits[i].trim() && i > 0) {
                refs.current[i - 1]?.focus();
              }
            }}
          />
        );
      })}
    </View>
  );
}

const otpStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginVertical: 6 },
  box: {
    width: 40,
    height: 48,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.border,
    textAlign: 'center',
    ...SIGNUP_TEXT.otpDigit,
    color: C.text,
    backgroundColor: C.surface,
  },
  // Uses the accent (green) from C to stay in sync with the design system.
  boxFilled: { borderColor: C.accent, backgroundColor: '#f0fdf4' },
});
