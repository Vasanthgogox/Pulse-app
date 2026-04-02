import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Resources = More: Profile, Finance. Indents is a bottom tab. */
export default function ResourcesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 400);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingTop: insets.top + 16, paddingBottom: 24 + insets.bottom },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={Theme.primary}
        />
      }
    >
      <Text style={styles.title}>{t("more")}</Text>
      <View style={styles.list}>
        <TouchableOpacity
          style={styles.row}
          onPress={() => router.push("/(tabs)/profile")}
        >
          <FontAwesome
            name="cog"
            size={22}
            color={Theme.iconPrimary}
            style={styles.rowIcon}
          />
          <Text style={styles.rowLabel}>{t("profile")}</Text>
          <FontAwesome
            name="chevron-right"
            size={16}
            color={Theme.iconSecondary}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.row}
          onPress={() => router.push("/(tabs)/finance")}
        >
          <FontAwesome
            name="money"
            size={22}
            color={Theme.iconPrimary}
            style={styles.rowIcon}
          />
          <Text style={styles.rowLabel}>{t("financeCashbook")}</Text>
          <FontAwesome
            name="chevron-right"
            size={16}
            color={Theme.iconSecondary}
          />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.primaryText,
    marginBottom: 16,
  },
  list: {},
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  rowIcon: { marginRight: 16 },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    color: Theme.textPrimary,
  },
});
