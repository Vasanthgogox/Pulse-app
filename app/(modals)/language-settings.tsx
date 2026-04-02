/**
 * Language Settings — proper UI for selecting app language.
 * Grouped by region (India / Southeast Asia). No hardcoded text; all t(key).
 */
import { useLanguage } from "@/contexts/LanguageContext";
import type { LocaleOption } from "@/lib/i18n";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Theme from "@/constants/Theme";

const INDIA: LocaleOption["region"] = "india";
const SOUTHEAST_ASIA: LocaleOption["region"] = "southeast_asia";
const OTHER: LocaleOption["region"] = "other";

export default function LanguageSettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, locale, setLocale, localeOptions } = useLanguage();
  const [search, setSearch] = useState("");

  const filteredByRegion = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filter = (opt: LocaleOption) =>
      !q ||
      opt.label.toLowerCase().includes(q) ||
      opt.labelNative.toLowerCase().includes(q);
    const india = localeOptions.filter((o) => o.region === INDIA && filter(o));
    const sea = localeOptions.filter(
      (o) => o.region === SOUTHEAST_ASIA && filter(o)
    );
    const other = localeOptions.filter((o) => o.region === OTHER && filter(o));
    return { india, sea, other };
  }, [localeOptions, search]);

  const sections: { title: string; data: LocaleOption[] }[] = [
    { title: t("regionIndia"), data: filteredByRegion.india },
    { title: t("regionSoutheastAsia"), data: filteredByRegion.sea },
    { title: t("regionOther"), data: filteredByRegion.other },
  ].filter((s) => s.data.length > 0);

  const handleSelect = (value: LocaleOption["value"]) => {
    setLocale(value);
    router.back();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <FontAwesome name="arrow-left" size={20} color={Theme.textOnDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("languageSettings")}</Text>
        <View style={styles.backBtn} />
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder={t("searchLanguage")}
        placeholderTextColor={Theme.textMutedDemo}
        value={search}
        onChangeText={setSearch}
      />

      <FlatList
        data={sections}
        keyExtractor={(item) => item.title}
        renderItem={({ item: section }) => (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.data.map((opt) => {
              const selected = locale === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={styles.row}
                  onPress={() => handleSelect(opt.value)}
                  activeOpacity={0.7}
                >
                  <View style={styles.rowText}>
                    <Text style={styles.rowLabelNative}>{opt.labelNative}</Text>
                    <Text style={styles.rowLabel}>{opt.label}</Text>
                  </View>
                  {selected && (
                    <FontAwesome
                      name="check"
                      size={18}
                      color={Theme.primary}
                      style={styles.check}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        contentContainerStyle={{
          paddingBottom: 24 + insets.bottom,
          paddingHorizontal: 16,
        }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Theme.darkBackground,
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Theme.textOnDark,
  },
  searchInput: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: Theme.text,
    backgroundColor: Theme.backgroundInput,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: Theme.screenBackground,
    borderRadius: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  rowText: {
    flex: 1,
  },
  rowLabelNative: {
    fontSize: 17,
    fontWeight: "600",
    color: Theme.text,
  },
  rowLabel: {
    fontSize: 14,
    color: Theme.textSecondary,
    marginTop: 2,
  },
  check: {
    marginLeft: 8,
  },
});
