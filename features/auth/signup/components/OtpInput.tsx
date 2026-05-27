import { useRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

export function OtpInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const digits = value.padEnd(6, ' ').split('').slice(0, 6);

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
    onChange(next.slice(0, 6));
    if (idx < 5) refs.current[idx + 1]?.focus();
  };

  return (
    <View style={otpStyles.row}>
      {Array.from({ length: 6 }).map((_, i) => {
        const filled = digits[i].trim() !== '';
        return (
          <TextInput
            key={i}
            ref={(r) => { refs.current[i] = r; }}
            style={[otpStyles.box, filled && otpStyles.boxFilled]}
            value={filled ? digits[i] : ''}
            onChangeText={(t) => handleChange(i, t)}
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
  row: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginVertical: 8 },
  box: {
    width: 46, height: 56, borderRadius: 12, borderWidth: 1.5, borderColor: '#e2e8f0',
    textAlign: 'center', fontSize: 22, fontWeight: '700', color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  boxFilled: { borderColor: '#22c55e', backgroundColor: '#f0fdf4' },
});

