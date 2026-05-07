import Theme from '@/constants/Theme';
import {
  Animated,
  Modal,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Shared max width for trip rating / settlement modals (web + native). */
export const TRIP_FEEDBACK_MODAL_MAX_WIDTH = 400;

type TripFeedbackModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  children: React.ReactNode;
  /** When set, the card renders as `Animated.View` with this style (e.g. entry animation). */
  animatedCardStyle?: StyleProp<ViewStyle>;
};

export function TripFeedbackModal({
  visible,
  onRequestClose,
  children,
  animatedCardStyle,
}: TripFeedbackModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View
        style={[
          styles.overlay,
          {
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
            backgroundColor: Theme.feedbackModalBackdrop,
          },
        ]}
      >
        {animatedCardStyle != null ? (
          <Animated.View style={[styles.card, animatedCardStyle]}>{children}</Animated.View>
        ) : (
          <View style={styles.card}>{children}</View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 22,
    width: '100%',
    maxWidth: TRIP_FEEDBACK_MODAL_MAX_WIDTH,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.22,
        shadowRadius: 48,
      },
      android: { elevation: 22 },
      default: {},
    }),
  },
});
