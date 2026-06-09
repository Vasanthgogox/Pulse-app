/**
 * NetworkExportMenu — context-menu dropdown for PDF + Excel export.
 * Used by all desktop network tables/panels where MoreVertical menus exist.
 */
import Theme from "@/constants/Theme";
import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import { Download, FileSpreadsheet, FileText, Loader, MoreVertical, X } from "lucide-react-native";
import { useState, useCallback } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

export type ExportAction = {
  label: string;
  sublabel?: string;
  kind: "pdf" | "excel" | "csv";
  onExport: () => Promise<void>;
};

type Props = {
  actions: ExportAction[];
  /** Replace the default MoreVertical trigger with a custom element. */
  trigger?: React.ReactNode;
  /** Style applied to the trigger wrapper. */
  triggerStyle?: object;
};

export function NetworkExportMenu({ actions, trigger, triggerStyle }: Props) {
  const [visible, setVisible] = useState(false);
  const [loadingKind, setLoadingKind] = useState<"pdf" | "excel" | "csv" | null>(null);

  const handleAction = useCallback(async (action: ExportAction) => {
    setLoadingKind(action.kind);
    try {
      await action.onExport();
    } catch (err) {
      Alert.alert(
        "Export failed",
        err instanceof Error ? err.message : "Could not generate report.",
      );
    } finally {
      setLoadingKind(null);
      setVisible(false);
    }
  }, []);

  const iconForKind = (kind: "pdf" | "excel" | "csv") => {
    if (kind === "pdf") return <FileText size={15} color={METRONIC.text} strokeWidth={2} />;
    if (kind === "excel") return <FileSpreadsheet size={15} color="#217346" strokeWidth={2} />;
    return <Download size={15} color={METRONIC.text} strokeWidth={2} />;
  };

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        style={[styles.trigger, triggerStyle]}
        accessibilityRole="button"
        accessibilityLabel="Export options"
      >
        {trigger ?? <MoreVertical size={15} color={METRONIC.muted} />}
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)} />
        <View style={styles.menuCard}>
          <View style={styles.menuHeader}>
            <Text style={styles.menuTitle}>Export report</Text>
            <Pressable
              onPress={() => setVisible(false)}
              hitSlop={8}
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
            >
              <X size={14} color={METRONIC.muted} strokeWidth={2.4} />
            </Pressable>
          </View>

          {actions.map((action, idx) => {
            const isLoading = loadingKind === action.kind;
            return (
              <Pressable
                key={`${action.kind}-${idx}`}
                onPress={() => void handleAction(action)}
                disabled={loadingKind !== null}
                style={({ pressed }) => [
                  styles.menuItem,
                  idx > 0 && styles.menuItemBorder,
                  pressed && !loadingKind && styles.menuItemPressed,
                  loadingKind && !isLoading && styles.menuItemDimmed,
                ]}
              >
                <View style={styles.menuItemIcon}>
                  {isLoading ? (
                    <Loader size={15} color={Theme.primary} strokeWidth={2} />
                  ) : (
                    iconForKind(action.kind)
                  )}
                </View>
                <View style={styles.menuItemBody}>
                  <Text style={styles.menuItemLabel}>{action.label}</Text>
                  {action.sublabel ? (
                    <Text style={styles.menuItemSub}>{action.sublabel}</Text>
                  ) : null}
                </View>
                {isLoading ? (
                  <Text style={styles.menuItemLoading}>Generating…</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    padding: 4,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.25)",
  },
  menuCard: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: [{ translateX: -130 }, { translateY: -80 }],
    width: 260,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    overflow: "hidden",
    shadowColor: "#181C32",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  menuHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: METRONIC.border,
    backgroundColor: "#f9fafb",
  },
  menuTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: METRONIC.text,
    letterSpacing: -0.1,
  },
  closeBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: METRONIC.border,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  menuItemBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: METRONIC.border,
  },
  menuItemPressed: {
    backgroundColor: "#f5f8fa",
  },
  menuItemDimmed: {
    opacity: 0.4,
  },
  menuItemIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: "#f5f8fa",
    borderWidth: 1,
    borderColor: METRONIC.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  menuItemBody: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  menuItemLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: METRONIC.text,
  },
  menuItemSub: {
    fontSize: 11,
    fontWeight: "500",
    color: METRONIC.muted,
  },
  menuItemLoading: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.primary,
    flexShrink: 0,
  },
});
