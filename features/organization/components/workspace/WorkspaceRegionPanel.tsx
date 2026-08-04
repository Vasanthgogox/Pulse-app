/**
 * Business region — detail pane or in-hub overlay sheet.
 */
import Theme from "@/constants/Theme";
import { WorkspaceDetailLayout } from "@/features/organization/components/workspace/WorkspaceDetailLayout";
import { WorkspaceHubInlineSheet } from "@/features/organization/components/workspace/WorkspaceHubInlineSheet";
import { WORKSPACE_PANEL_TITLES } from "@/features/organization/components/workspace/workspacePanelTypes";
import type { LocaleRegion } from "@/lib/i18n";
import {
  WORKSPACE_REGION_LABELS,
  getWorkspaceRegion,
  setWorkspaceRegion,
} from "@/lib/workspaceRegion";
import { Check, Globe2, MapPin } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const REGION_OPTIONS: {
  id: LocaleRegion;
  title: string;
  body: string;
  emoji: string;
}[] = [
  {
    id: "india",
    title: WORKSPACE_REGION_LABELS.india,
    body: "Indian languages, GST workflows, and domestic lane defaults.",
    emoji: "🇮🇳",
  },
  {
    id: "southeast_asia",
    title: WORKSPACE_REGION_LABELS.southeast_asia,
    body: "SEA locales, cross-border lanes, and regional compliance packs.",
    emoji: "🌏",
  },
  {
    id: "other",
    title: WORKSPACE_REGION_LABELS.other,
    body: "Global English-first defaults with extended locale catalogue.",
    emoji: "🌍",
  },
];

type Props = {
  onBack: () => void;
  onRegionChange?: (region: LocaleRegion) => void;
  variant?: "detail" | "inline";
};

function RegionPickerBody({
  region,
  loading,
  onSelect,
}: {
  region: LocaleRegion;
  loading: boolean;
  onSelect: (next: LocaleRegion) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.hintRow}>
        <MapPin size={13} color={Theme.primary} strokeWidth={2} />
        <Text style={styles.hintText}>
          Sets default locale packs, tax labels, and compliance hints for your workspace.
        </Text>
      </View>
      {REGION_OPTIONS.map((opt, idx) => {
        const selected = !loading && region === opt.id;
        return (
          <Pressable
            key={opt.id}
            onPress={() => onSelect(opt.id)}
            style={({ pressed }) => [
              styles.row,
              idx === 0 && styles.rowFirst,
              pressed && !selected && styles.rowPressed,
              selected && styles.rowSelected,
            ]}
          >
            {selected ? <View style={styles.rowAccent} /> : null}
            <View style={[styles.iconWrap, selected && styles.iconWrapOn]}>
              <Text style={styles.emoji}>{opt.emoji}</Text>
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, selected && styles.rowLabelOn]}>
                {opt.title}
              </Text>
              <Text style={styles.rowBody}>{opt.body}</Text>
            </View>
            {selected ? (
              <View style={styles.checkWrap}>
                <Check size={12} color={Theme.buttonPrimaryText} strokeWidth={2.6} />
              </View>
            ) : (
              <Globe2 size={14} color={Theme.textMuted} strokeWidth={1.8} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export function WorkspaceRegionPanel({
  onBack,
  onRegionChange,
  variant = "detail",
}: Props) {
  const [region, setRegion] = useState<LocaleRegion>("india");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void getWorkspaceRegion().then((value) => {
      if (mounted) {
        setRegion(value);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const selectRegion = useCallback(
    async (next: LocaleRegion) => {
      setRegion(next);
      await setWorkspaceRegion(next);
      onRegionChange?.(next);
    },
    [onRegionChange],
  );

  const body = (
    <RegionPickerBody
      region={region}
      loading={loading}
      onSelect={(next) => void selectRegion(next)}
    />
  );

  if (variant === "inline") {
    return (
      <WorkspaceHubInlineSheet
        title={WORKSPACE_PANEL_TITLES.region}
        subtitle="Workspace locale defaults"
        onClose={onBack}
      >
        {body}
      </WorkspaceHubInlineSheet>
    );
  }

  return (
    <WorkspaceDetailLayout
      title={WORKSPACE_PANEL_TITLES.region}
      subtitle="Workspace locale & compliance defaults"
      onBack={onBack}
    >
      {body}
    </WorkspaceDetailLayout>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(79, 70, 229, 0.06)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  hintText: {
    flex: 1,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    position: "relative",
  },
  rowFirst: { borderTopWidth: 0 },
  rowPressed: { backgroundColor: Theme.surface },
  rowSelected: { backgroundColor: "rgba(79, 70, 229, 0.07)" },
  rowAccent: {
    position: "absolute",
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
    backgroundColor: Theme.buttonPrimary,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    marginTop: 1,
  },
  iconWrapOn: {
    backgroundColor: "rgba(79, 70, 229, 0.12)",
  },
  emoji: { fontSize: 16 },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 12, fontWeight: "600", color: Theme.textPrimaryDark },
  rowLabelOn: { color: Theme.primary, fontWeight: "700" },
  rowBody: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 2,
    lineHeight: 14,
  },
  checkWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Theme.buttonPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
});
