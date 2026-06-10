/**
 * Lists organizations mutually connected to the viewer and a target org.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  getMutualConnections,
  type MutualConnectionRow,
} from "@/features/network/services/mutual-connections.service";
import { X } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type MutualConnectionsModalProps = {
  visible: boolean;
  viewerOrgId: string | null;
  targetOrgId: string | null;
  targetOrgName?: string;
  onClose: () => void;
  onOpenProfile: (org: MutualConnectionRow) => void;
};

export function MutualConnectionsModal({
  visible,
  viewerOrgId,
  targetOrgId,
  targetOrgName,
  onClose,
  onOpenProfile,
}: MutualConnectionsModalProps) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mutuals, setMutuals] = useState<MutualConnectionRow[]>([]);

  const load = useCallback(async () => {
    if (!visible || !viewerOrgId || !targetOrgId) return;
    setLoading(true);
    setError(null);
    const { error: fetchError, mutuals: rows } = await getMutualConnections(
      viewerOrgId,
      targetOrgId,
    );
    setLoading(false);
    if (fetchError) {
      setError(fetchError.message);
      setMutuals([]);
      return;
    }
    setMutuals(rows);
  }, [targetOrgId, viewerOrgId, visible]);

  useEffect(() => {
    if (!visible) {
      setMutuals([]);
      setError(null);
      return;
    }
    void load();
  }, [load, visible]);

  const title = targetOrgName?.trim()
    ? `Mutuals with ${targetOrgName.trim()}`
    : t("networkMutualConnectionsTitleGeneric");

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouch} onPress={onClose} accessibilityLabel="Close" />
        <View
          style={[
            styles.card,
            {
              paddingTop: insets.top + 12,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <View style={styles.head}>
            <View style={styles.headText}>
              <Text style={styles.kicker}>{t("networkDiscoverMutualsSection")}</Text>
              <Text style={styles.title} numberOfLines={2}>
                {title}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.72 }]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={18} color={Theme.textPrimaryDark} strokeWidth={2.4} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loading}>
              <LoadingIndicator color={Theme.primary} />
            </View>
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : mutuals.length === 0 ? (
            <Text style={styles.emptyText}>{t("networkMutualConnectionsEmpty")}</Text>
          ) : (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
            >
              {mutuals.map((row) => (
                <Pressable
                  key={row.id}
                  onPress={() => {
                    onOpenProfile(row);
                    onClose();
                  }}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.88 }]}
                  accessibilityRole="button"
                  accessibilityLabel={row.name}
                >
                  <PartyAvatar
                    name={row.name}
                    initialsColorSeed={row.id}
                    avatarUrl={row.avatar_url}
                    avatarSeed={row.avatar_seed}
                    entityType="client"
                    size={40}
                    borderStyle={styles.avatarBorder}
                  />
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {row.name}
                    </Text>
                    <Text style={styles.rowHint}>{t("networkMutualConnectionsViewProfile")}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.58)",
    justifyContent: "flex-end",
  },
  backdropTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    maxHeight: "78%",
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    paddingHorizontal: 20,
  },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  headText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  kicker: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: Theme.textSection,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
  },
  loading: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    fontSize: 13,
    color: Theme.teslaRed,
    paddingVertical: 16,
  },
  emptyText: {
    fontSize: 13,
    color: Theme.textSecondary,
    paddingVertical: 16,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    gap: 8,
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  avatarBorder: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  rowInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowName: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  rowHint: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.primary,
  },
});
