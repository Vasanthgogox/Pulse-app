import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOptionalAuth } from "@/contexts/AuthContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTransactionsQuery } from "@/lib/queries/useTransactionsQuery";
import {
  fetchClientFeed,
  getClientFeedStatusMap,
} from "@/features/client-feed";

/** Resources = More: Profile, Finance, From Clients. Indents is a bottom tab. */
export default function ResourcesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const auth = useOptionalAuth();
  const organization = useOptionalOrganization();
  const orgId = organization?.currentOrganization?.id ?? null;

  const [refreshing, setRefreshing] = useState(false);
  const [clientFeedUnread, setClientFeedUnread] = useState<number>(0);

  const { data: localLedger = [], refetch: refetchLedger } =
    useTransactionsQuery(orgId);

  /**
   * Refresh the "From Clients" unread badge. Runs on mount + pull-to-refresh.
   * Failures are swallowed — the badge just won't appear; not worth blocking
   * the Resources menu on a background count.
   */
  const refreshUnreadCount = useCallback(async () => {
    if (!auth || !orgId) {
      setClientFeedUnread(0);
      return;
    }
    try {
      const localStatusByEntryId = await getClientFeedStatusMap(orgId);
      const { bundle } = await fetchClientFeed({
        orgId,
        localLedger,
        localStatusByEntryId,
      });
      setClientFeedUnread(bundle.unreadCount);
    } catch {
      setClientFeedUnread(0);
    }
  }, [auth, orgId, localLedger]);

  useEffect(() => {
    void refreshUnreadCount();
  }, [refreshUnreadCount]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetchLedger();
    await refreshUnreadCount();
    setRefreshing(false);
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
          onPress={() => router.push("/from-clients")}
        >
          <FontAwesome
            name="inbox"
            size={22}
            color={Theme.iconPrimary}
            style={styles.rowIcon}
          />
          <View style={styles.rowLabelWrap}>
            <Text style={styles.rowLabel}>From Clients</Text>
            <Text style={styles.rowSub}>
              Auto-filled from your client's records
            </Text>
          </View>
          {clientFeedUnread > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{clientFeedUnread}</Text>
            </View>
          ) : null}
          <FontAwesome
            name="chevron-right"
            size={16}
            color={Theme.iconSecondary}
          />
        </TouchableOpacity>

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
  rowLabelWrap: {
    flex: 1,
    gap: 2,
  },
  rowSub: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 7,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.textOnDark,
  },
});
