import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PULSE_SIGNUP, PULSE_SIGNUP_RADIUS } from './signUpPulseTheme';

export type SignUpPillOption<T extends string = string> = {
  value: T;
  label: string;
  sub?: string;
};

export interface SignUpPillSelectProps<T extends string = string> {
  label: string;
  required?: boolean;
  options: readonly SignUpPillOption<T>[] | readonly T[];
  value: T | null;
  onChange: (value: T) => void;
  error?: string | null;
}

function normalizeOptions<T extends string>(
  options: readonly SignUpPillOption<T>[] | readonly T[],
): SignUpPillOption<T>[] {
  return options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt,
  );
}

export function SignUpPillSelect<T extends string>({
  label,
  required,
  options,
  value,
  onChange,
  error,
}: SignUpPillSelectProps<T>) {
  const items = normalizeOptions(options);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.req}> *</Text> : null}
      </Text>
      <View style={styles.row} accessibilityRole="radiogroup">
        {items.map((opt) => {
          const selected = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              style={({ pressed }) => [
                styles.pill,
                selected && styles.pillSelected,
                pressed && styles.pillPressed,
              ]}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
            >
              <Text style={[styles.pillLabel, selected && styles.pillLabelSelected]}>
                {opt.label}
              </Text>
              {opt.sub ? (
                <Text style={[styles.pillSub, selected && styles.pillSubSelected]}>
                  {opt.sub}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 24,
  },
  label: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: PULSE_SIGNUP.muted,
    marginBottom: 12,
    paddingLeft: 4,
  },
  req: {
    color: '#ef4444',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: PULSE_SIGNUP_RADIUS.pill,
    borderWidth: 1,
    borderColor: PULSE_SIGNUP.border,
    backgroundColor: PULSE_SIGNUP.bg,
    minWidth: 72,
  },
  pillSelected: {
    borderColor: PULSE_SIGNUP.primary,
    backgroundColor: PULSE_SIGNUP.primaryTint,
  },
  pillPressed: {
    opacity: 0.9,
  },
  pillLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  pillLabelSelected: {
    color: PULSE_SIGNUP.primary,
  },
  pillSub: {
    fontSize: 10,
    fontWeight: '500',
    color: PULSE_SIGNUP.muted,
    marginTop: 2,
  },
  pillSubSelected: {
    color: PULSE_SIGNUP.primaryDark,
  },
  error: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 8,
    fontWeight: '600',
  },
});
