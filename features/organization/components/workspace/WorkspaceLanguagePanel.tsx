/**
 * Language picker — detail pane or in-hub overlay sheet.
 */
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import { WorkspaceDetailLayout } from "@/features/organization/components/workspace/WorkspaceDetailLayout";
import { WorkspaceHubInlineSheet } from "@/features/organization/components/workspace/WorkspaceHubInlineSheet";
import { WORKSPACE_PANEL_TITLES } from "@/features/organization/components/workspace/workspacePanelTypes";
import type { LocaleOption } from "@/lib/i18n";
import { Check, Search } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

type Props = {
  onBack: () => void;
  variant?: "detail" | "inline";
};

function LanguagePickerBody({
  compact,
  onSelect,
}: {
  compact?: boolean;
  onSelect?: () => void;
}) {
  const { locale, setLocale, localeOptions } = useLanguage();
  const [search, setSearch] = useState("");

  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filter = (opt: LocaleOption) =>
      !q ||
      opt.label.toLowerCase().includes(q) ||
      opt.labelNative.toLowerCase().includes(q);
    const groups: { title: string; data: LocaleOption[] }[] = [
      {
        title: "India",
        data: localeOptions.filter((o) => o.region === "india" && filter(o)),
      },
      {
        title: "Southeast Asia",
        data: localeOptions.filter((o) => o.region === "southeast_asia" && filter(o)),
      },
      {
        title: "Global",
        data: localeOptions.filter((o) => o.region === "other" && filter(o)),
      },
    ];
    return groups.filter((g) => g.data.length > 0);
  }, [localeOptions, search]);

  return (
    <>
      {compact ? (
        <View style={styles.searchWrap}>
          <Search size={14} color={Theme.textMuted} strokeWidth={2} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search languages…"
            placeholderTextColor={Theme.textMuted}
          />
        </View>
      ) : null}
      {sections.map((section) => (
        <View key={section.title} style={styles.card}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionDot} />
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
          {section.data.map((opt, idx) => {
            const selected = locale === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => {
                  setLocale(opt.value);
                  onSelect?.();
                }}
                style={({ pressed }) => [
                  styles.row,
                  idx === 0 && styles.rowFirst,
                  pressed && !selected && styles.rowPressed,
                  selected && styles.rowSelected,
                ]}
              >
                {selected ? <View style={styles.rowAccent} /> : null}
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, selected && styles.rowLabelOn]}>
                    {opt.label}
                  </Text>
                  <Text style={styles.rowNative}>{opt.labelNative}</Text>
                </View>
                {selected ? (
                  <View style={styles.checkWrap}>
                    <Check size={12} color={Theme.textOnPrimary} strokeWidth={2.6} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </>
  );
}

export function WorkspaceLanguagePanel({ onBack, variant = "detail" }: Props) {
  if (variant === "inline") {
    return (
      <WorkspaceHubInlineSheet
        title={WORKSPACE_PANEL_TITLES.language}
        subtitle="App display language"
        onClose={onBack}
      >
        <LanguagePickerBody compact />
      </WorkspaceHubInlineSheet>
    );
  }

  return (
    <WorkspaceDetailLayout
      title={WORKSPACE_PANEL_TITLES.language}
      subtitle="App display language"
      onBack={onBack}
    >
      <LanguagePickerBody />
    </WorkspaceDetailLayout>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    marginBottom: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    padding: 0,
  },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: Theme.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.primary,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.9,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
    top: 6,
    bottom: 6,
    width: 3,
    borderRadius: 2,
    backgroundColor: Theme.primary,
  },
  rowText: { flex: 1, minWidth: 0, paddingLeft: 4 },
  rowLabel: { fontSize: 12, fontWeight: "600", color: Theme.textPrimaryDark },
  rowLabelOn: { color: Theme.primary, fontWeight: "700" },
  rowNative: { fontSize: 10, fontWeight: "500", color: Theme.textMuted, marginTop: 1 },
  checkWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
