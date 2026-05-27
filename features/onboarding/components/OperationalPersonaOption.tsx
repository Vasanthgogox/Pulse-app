import { memo, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { ChevronRight } from 'lucide-react-native';

import { colors } from '@/design-system/colors';
import { radius } from '@/design-system/radius';
import { space } from '@/design-system/spacing';
import { typography } from '@/design-system/typography';

export interface OperationalPersonaOptionProps {
  title: string;
  subtitle: string;
  icon: ComponentProps<typeof FontAwesome>['name'];
  onPress: () => void;
  trailing?: ReactNode;
  accessibilityLabel?: string;
}

export const OperationalPersonaOption = memo(function OperationalPersonaOption({
  title,
  subtitle,
  icon,
  onPress,
  trailing,
  accessibilityLabel,
}: OperationalPersonaOptionProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
    >
      <View style={styles.iconWrap}>
        <FontAwesome name={icon} size={18} color={colors.brand} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{subtitle}</Text>
      </View>
      {trailing ?? <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[4],
    paddingHorizontal: space[1],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
    minHeight: 64,
  },
  rowPressed: {
    opacity: 0.88,
    backgroundColor: colors.surface,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...typography.bodyMedium,
    fontWeight: '700',
    marginBottom: 2,
  },
  sub: {
    ...typography.caption,
    lineHeight: 17,
  },
});
