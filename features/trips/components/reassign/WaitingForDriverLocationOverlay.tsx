import Theme from '@/constants/Theme';
import { Text, View } from 'react-native';

type Props = {
  visible: boolean;
};

/** Shown on tracking map after reassign until new driver presence arrives (or timeout). */
export function WaitingForDriverLocationOverlay({ visible }: Props) {
  if (!visible) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 12,
        alignItems: 'center',
        zIndex: 12,
      }}
    >
      <View
        style={{
          backgroundColor: 'rgba(15, 23, 42, 0.88)',
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: Theme.border,
        }}
      >
        <Text
          style={{
            color: Theme.textOnPrimary,
            fontSize: 13,
            fontWeight: '600',
          }}
        >
          Waiting for new driver location…
        </Text>
      </View>
    </View>
  );
}
