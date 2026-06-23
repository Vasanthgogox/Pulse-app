import Feather from "@expo/vector-icons/Feather";
import { Activity, Flag, Layers, PlayCircle } from "lucide-react-native";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { DriverOpsLauncherOption } from "@/features/trips/operations/shared/DriverOpsLauncherOption";

type Side = "start" | "end" | "both";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (side: Side) => void;
};

const OPTIONS = [
  {
    side: "start" as const,
    title: "Start reading",
    subtitle: "KM at trip start · photo OCR",
    Icon: PlayCircle,
    iconTint: "#0369a1",
    iconBg: "rgba(14,165,233,0.12)",
  },
  {
    side: "end" as const,
    title: "End reading",
    subtitle: "KM at trip close · photo OCR",
    Icon: Flag,
    iconTint: Theme.driverEmeraldDark,
    iconBg: Theme.driverEmeraldMuted,
  },
  {
    side: "both" as const,
    title: "Start & end",
    subtitle: "Record both readings in one flow",
    Icon: Layers,
    iconTint: "#4D3636",
    iconBg: "rgba(99,102,241,0.12)",
  },
];

export function TripOdometerLauncherSheet({ visible, onClose, onSelect }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Activity size={18} color={Theme.driverEmeraldDark} strokeWidth={2.2} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.kicker}>Odometer</Text>
              <Text style={styles.title}>Record KM reading</Text>
              <Text style={styles.subtitle}>Scan dashboard photo — AI fills digits</Text>
            </View>
          </View>

          <View style={styles.options}>
            {OPTIONS.map((opt) => (
              <DriverOpsLauncherOption
                key={opt.side}
                title={opt.title}
                subtitle={opt.subtitle}
                Icon={opt.Icon}
                iconTint={opt.iconTint}
                iconBg={opt.iconBg}
                onPress={() => {
                  onSelect(opt.side);
                  onClose();
                }}
              />
            ))}
          </View>

          <Pressable style={styles.cancelBtn} onPress={onClose} accessibilityRole="button">
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 8,
    gap: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.border,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 4,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  kicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 16,
  },
  options: {
    gap: 10,
  },
  cancelBtn: {
    alignItems: "center",
    paddingVertical: 12,
    marginTop: 2,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
});
