import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/design-system/colors';
import { radius } from '@/design-system/radius';
import { space } from '@/design-system/spacing';
import { typography } from '@/design-system/typography';

export interface OperationalSelectorOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

export interface OperationalSelectorGroupProps<T extends string> {
  label: string;
  required?: boolean;
  options: readonly OperationalSelectorOption<T>[];
  value: T | null | undefined;
  onChange: (value: T) => void;
  error?: string | null;
  layout?: 'list' | 'grid' | 'chips';
  columns?: 2 | 3;
}

export function OperationalSelectorGroup<T extends string>({
  label,
  required,
  options,
  value,
  onChange,
  error,
  layout = 'list',
  columns = 2,
}: OperationalSelectorGroupProps<T>) {
  return (
    <View style={styles.group}>
      <Text style={[styles.label, error ? styles.labelError : null]}>
        {label}
        {required ? <Text style={styles.req}> *</Text> : null}
      </Text>

      <View
        style={[
          layout === 'chips' && styles.chipWrap,
          layout === 'grid' && styles.grid,
          layout === 'grid' && columns === 3 && styles.grid3,
        ]}
      >
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              style={[
                layout === 'chips' ? styles.chip : styles.option,
                selected && (layout === 'chips' ? styles.chipSelected : styles.optionSelected),
                layout === 'grid' && styles.gridItem,
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <Text
                style={[
                  layout === 'chips' ? styles.chipText : styles.optionLabel,
                  selected && styles.optionLabelSelected,
                ]}
              >
                {opt.label}
              </Text>
              {opt.description && layout !== 'chips' ? (
                <Text style={styles.optionSub}>{opt.description}</Text>
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
  group: {
    marginBottom: space[5],
  },
  label: {
    ...typography.label,
    fontSize: 10,
    marginBottom: space[2],
    color: colors.textSecondary,
  },
  labelError: {
    color: colors.cost,
  },
  req: {
    color: colors.cost,
  },
  list: {},
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  grid3: {},
  gridItem: {
    width: '48%',
  },
  option: {
    paddingVertical: space[3],
    paddingHorizontal: space[3],
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginBottom: space[2],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  optionSelected: {
    backgroundColor: '#ecfdf5',
    borderColor: colors.brand,
  },
  optionLabel: {
    ...typography.bodyMedium,
    fontSize: 14,
  },
  optionLabelSelected: {
    color: colors.brand,
    fontWeight: '700',
  },
  optionSub: {
    ...typography.caption,
    marginTop: 2,
    fontSize: 11,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  chip: {
    paddingVertical: space[2],
    paddingHorizontal: space[3],
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  chipSelected: {
    backgroundColor: '#ecfdf5',
    borderColor: colors.brand,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  error: {
    fontSize: 11,
    color: colors.cost,
    marginTop: space[1],
    fontWeight: '500',
  },
});
