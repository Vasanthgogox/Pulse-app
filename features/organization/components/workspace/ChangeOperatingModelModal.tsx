/**
 * Owner-only operating-model switch with an impact preview.
 *
 * A model switch is a pure capability re-gate — no data is deleted. Downgrades
 * hide surfaces the new model can't reach (suppliers / fleet / give-load), so we
 * show the blast radius and require explicit confirmation before applying.
 */
import Theme from "@/constants/Theme";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { OPERATING_MODELS } from "@/features/auth/signup/signUpConstants";
import {
  operatingModelTransition,
  type ModelHiddenSurface,
} from "@/lib/capabilities";
import { useDriversQuery } from "@/lib/queries/useDriversQuery";
import { useSuppliersQuery } from "@/lib/queries/useSuppliersQuery";
import { AlertTriangle, Check } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export type OperatingModel = "ASSET_BASED" | "NON_ASSET" | "HYBRID";

type Props = {
  visible: boolean;
  orgId: string;
  currentModel: OperatingModel;
  saving: boolean;
  /** Called with the chosen model once the user confirms. */
  onConfirm: (model: OperatingModel) => void;
  onClose: () => void;
};

const SURFACE_LABEL: Record<ModelHiddenSurface, string> = {
  suppliers: "Suppliers",
  indents: "Give-load / indents",
  posts: "Broadcast load posts",
  vehicles: "Vehicles / garage",
  drivers: "Drivers & fleet",
  bids: "Marketplace bids",
};

export function ChangeOperatingModelModal({
  visible,
  orgId,
  currentModel,
  saving,
  onConfirm,
  onClose,
}: Props) {
  const [selected, setSelected] = useState<OperatingModel>(currentModel);

  // Live counts for the two concrete surfaces users care about. Already cached.
  const suppliersQ = useSuppliersQuery(orgId);
  const driversQ = useDriversQuery(orgId);
  const supplierCount = (suppliersQ.data ?? []).length;
  const driverCount = (driversQ.data ?? []).filter((d) => !d.left_at).length;
  // Counts aren't trustworthy until both queries settle — a mid-fetch 0 would
  // read as "nothing to lose" and mislead the user into confirming.
  const countsLoading = suppliersQ.isLoading || driversQ.isLoading;

  const transition = useMemo(
    () => operatingModelTransition(currentModel, selected),
    [currentModel, selected],
  );

  const isNoChange = selected === currentModel;
  const isDowngrade =
    transition.direction === "downgrade" || transition.direction === "lateral";

  const hiddenLines = useMemo(() => {
    return transition.hiddenSurfaces.map((s) => {
      let count: number | null = null;
      if (s === "suppliers") count = supplierCount;
      if (s === "drivers") count = driverCount;
      return {
        surface: s,
        label: SURFACE_LABEL[s],
        // Only surface a count once it's real — never a mid-fetch 0.
        count: countsLoading ? null : count,
      };
    });
  }, [transition.hiddenSurfaces, supplierCount, driverCount, countsLoading]);

  const hasLiveData =
    !countsLoading &&
    ((transition.hiddenSurfaces.includes("suppliers") && supplierCount > 0) ||
      (transition.hiddenSurfaces.includes("drivers") && driverCount > 0));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Change operating model</Text>
          <Text style={styles.subtitle}>
            This controls which tools your workspace can use. You can change it
            again after 30 days.
          </Text>

          <View style={styles.options}>
            {OPERATING_MODELS.map((m) => {
              const active = selected === m.value;
              const isCurrent = currentModel === m.value;
              return (
                <Pressable
                  key={m.value}
                  onPress={() => setSelected(m.value as OperatingModel)}
                  disabled={saving}
                  style={[styles.option, active && styles.optionActive]}
                >
                  <View style={styles.optionTextWrap}>
                    <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                      {m.label}
                      {isCurrent ? "  (current)" : ""}
                    </Text>
                    <Text style={styles.optionSub}>{m.sub}</Text>
                  </View>
                  {active ? <Check size={18} color={Theme.primary} /> : null}
                </Pressable>
              );
            })}
          </View>

          {isDowngrade && !isNoChange ? (
            <ScrollView style={styles.impact} contentContainerStyle={styles.impactContent}>
              <View style={styles.impactHead}>
                <AlertTriangle size={15} color={Theme.warning} />
                <Text style={styles.impactTitle}>What changes</Text>
              </View>
              <Text style={styles.impactBody}>
                These stay in your data (nothing is deleted) but will be hidden.
                Switch back to restore access:
              </Text>
              {hiddenLines.map((l) => (
                <Text key={l.surface} style={styles.impactItem}>
                  •  {l.label}
                  {l.count != null
                    ? l.count > 0
                      ? `  —  ${l.count} active`
                      : "  —  none yet"
                    : ""}
                </Text>
              ))}
              {hasLiveData ? (
                <Text style={styles.impactCaveat}>
                  Any outstanding balances for hidden parties remain in your
                  finance totals but won&apos;t have their own tab.
                </Text>
              ) : null}
            </ScrollView>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              disabled={saving}
              style={[styles.btn, styles.btnGhost]}
            >
              <Text style={styles.btnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => onConfirm(selected)}
              disabled={saving || isNoChange}
              style={[
                styles.btn,
                styles.btnPrimary,
                (saving || isNoChange) && styles.btnDisabled,
              ]}
            >
              {saving ? (
                <LoadingIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.btnPrimaryText}>
                  {isDowngrade && !isNoChange ? "Change anyway" : "Change model"}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: Theme.surface,
    borderRadius: 16,
    padding: 20,
  },
  title: { fontSize: 17, fontWeight: "700", color: Theme.textPrimary },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: Theme.textSecondary,
  },
  options: { marginTop: 16, gap: 8 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  optionActive: {
    borderColor: Theme.primary,
    backgroundColor: Theme.primaryLight,
  },
  optionTextWrap: { flex: 1 },
  optionLabel: { fontSize: 15, fontWeight: "600", color: Theme.textPrimary },
  optionLabelActive: { color: Theme.primary },
  optionSub: { fontSize: 12, color: Theme.textSecondary, marginTop: 2 },
  impact: {
    marginTop: 16,
    maxHeight: 200,
    borderRadius: 12,
    backgroundColor: Theme.warningMuted,
  },
  impactContent: { padding: 14 },
  impactHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  impactTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.warning,
  },
  impactBody: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 17,
    color: Theme.textSecondary,
  },
  impactItem: {
    marginTop: 6,
    fontSize: 13,
    color: Theme.textPrimary,
    fontWeight: "500",
  },
  impactCaveat: {
    marginTop: 10,
    fontSize: 11.5,
    lineHeight: 16,
    fontStyle: "italic",
    color: Theme.textSecondary,
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 20 },
  btn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnGhost: { backgroundColor: Theme.surfaceLight },
  btnGhostText: { fontSize: 14, fontWeight: "600", color: Theme.textPrimary },
  btnPrimary: { backgroundColor: Theme.primary },
  btnPrimaryText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  btnDisabled: { opacity: 0.5 },
});
