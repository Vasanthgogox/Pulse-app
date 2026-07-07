import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PULSE_SIGNUP, PULSE_SIGNUP_RADIUS } from './signUpPulseTheme';
import { createPulseSignUpTextStyles, SIGNUP_ERROR_COLOR } from './signUpTypography';

const GRID_GAP = 6;

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
  /** Equal-width grid columns (default: 3). */
  columns?: number;
  /** Card = stacked title + subtitle, centered (operating model). */
  layout?: 'chip' | 'card';
}

function normalizeOptions<T extends string>(
  options: readonly SignUpPillOption<T>[] | readonly T[],
): SignUpPillOption<T>[] {
  return options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt,
  );
}

function gridCellWidth(columns: number): `${number}%` {
  return `${100 / columns}%` as `${number}%`;
}

const text = createPulseSignUpTextStyles(PULSE_SIGNUP);

export function SignUpPillSelect<T extends string>({
  label,
  required,
  options,
  value,
  onChange,
  error,
  columns = 3,
  layout = 'chip',
}: SignUpPillSelectProps<T>) {
  const items = normalizeOptions(options);
  const cellWidth = gridCellWidth(columns);
  const isCard = layout === 'card';

  return (
    <View style={styles.wrap}>
      <Text style={text.fieldLabel}>
        {label}
        {required ? <Text style={styles.req}> *</Text> : null}
      </Text>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {items.map((opt) => {
          const selected = value === opt.value;
          return (
            <View key={opt.value} style={[styles.cell, { width: cellWidth }]}>
              <Pressable
                onPress={() => onChange(opt.value)}
                style={({ pressed }) => [
                  styles.pill,
                  isCard && styles.pillCard,
                  selected && styles.pillSelected,
                  pressed && styles.pillPressed,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
              >
                <Text
                  style={[
                    text.pillLabel,
                    styles.pillLabel,
                    isCard && styles.pillLabelCard,
                    selected && text.pillLabelSelected,
                  ]}
                  numberOfLines={isCard ? 1 : 2}
                  adjustsFontSizeToFit={!isCard}
                  minimumFontScale={0.85}
                >
                  {opt.label}
                </Text>
                {opt.sub ? (
                  <Text
                    style={[text.pillSub, styles.pillSub, selected && text.pillSubSelected]}
                    numberOfLines={1}
                  >
                    {opt.sub}
                  </Text>
                ) : null}
              </Pressable>
            </View>
          );
        })}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 14,
  },
  req: {
    color: SIGNUP_ERROR_COLOR,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -GRID_GAP / 2,
  },
  cell: {
    paddingHorizontal: GRID_GAP / 2,
    paddingBottom: GRID_GAP,
  },
  pill: {
    paddingHorizontal: 6,
    paddingVertical: 7,
    borderRadius: PULSE_SIGNUP_RADIUS.pill,
    borderWidth: 1,
    borderColor: PULSE_SIGNUP.border,
    backgroundColor: PULSE_SIGNUP.bg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
  },
  pillLabel: {
    textAlign: 'center',
  },
  pillCard: {
    paddingHorizontal: 4,
    paddingVertical: 8,
    minHeight: 46,
  },
  pillLabelCard: {
    textAlign: 'center',
  },
  pillSub: {
    textAlign: 'center',
    marginTop: 2,
  },
  pillSelected: {
    borderColor: PULSE_SIGNUP.primaryDark,
    backgroundColor: PULSE_SIGNUP.primaryTint,
  },
  pillPressed: {
    opacity: 0.92,
  },
  error: {
    ...createPulseSignUpTextStyles(PULSE_SIGNUP).error,
    marginTop: 4,
  },
});
