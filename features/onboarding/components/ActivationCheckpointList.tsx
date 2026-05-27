import { memo, type ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { Surface } from '@/components/operational';
import { colors } from '@/design-system/colors';
import { space } from '@/design-system/spacing';
import { typography } from '@/design-system/typography';

export type ActivationCheckpointStatus = 'pending' | 'in_progress' | 'complete' | 'blocked';

export interface ActivationCheckpoint {
  id: string;
  label: string;
  detail?: string;
  status: ActivationCheckpointStatus;
}

export interface ActivationCheckpointListProps {
  checkpoints: readonly ActivationCheckpoint[];
  density?: 'low' | 'medium' | 'high';
}

const STATUS_ICON: Record<
  ActivationCheckpointStatus,
  { name: ComponentProps<typeof FontAwesome>['name']; color: string }
> = {
  pending: { name: 'circle-o', color: colors.textMuted },
  in_progress: { name: 'clock-o', color: colors.pending },
  complete: { name: 'check-circle', color: colors.revenue },
  blocked: { name: 'exclamation-circle', color: colors.cost },
};

export const ActivationCheckpointList = memo(function ActivationCheckpointList({
  checkpoints,
  density = 'medium',
}: ActivationCheckpointListProps) {
  return (
    <Surface elevation={0} density={density} paddingVertical={space[2]} paddingHorizontal={0}>
      {checkpoints.map((cp, index) => {
        const icon = STATUS_ICON[cp.status];
        const isLast = index === checkpoints.length - 1;
        return (
          <View
            key={cp.id}
            style={[styles.row, !isLast && styles.rowDivider]}
            accessibilityState={{ checked: cp.status === 'complete' }}
          >
            <FontAwesome name={icon.name} size={16} color={icon.color} />
            <View style={styles.body}>
              <Text style={styles.label}>{cp.label}</Text>
              {cp.detail ? <Text style={styles.detail}>{cp.detail}</Text> : null}
            </View>
          </View>
        );
      })}
    </Surface>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[1],
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    ...typography.bodyMedium,
    fontSize: 14,
  },
  detail: {
    ...typography.caption,
    marginTop: 2,
  },
});
