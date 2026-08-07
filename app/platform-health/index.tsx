/**
 * Platform Health — Scalability & Reliability Platform P0 engineering homepage.
 * Client-side realtime + cache counters. DB CPU/pool remain Supabase dashboard
 * until server metrics are wired. @see docs/SCALABILITY_PLATFORM.md
 */
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  getPlatformHealthSnapshot,
  type PlatformHealthSnapshot,
} from "@/lib/platform/scalability";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function MetricRow({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function PlatformHealthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { currentOrganization } = useOrganization();
  const [snap, setSnap] = useState<PlatformHealthSnapshot | null>(null);

  const refresh = useCallback(() => {
    setSnap(getPlatformHealthSnapshot());
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Engineering surface: allow in __DEV__, or when signed into an org (same
  // bar as other internal tools). Not customer-facing.
  const allowed = __DEV__ || Boolean(currentOrganization?.id);
  if (!allowed) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.error}>Sign in to view Platform Health.</Text>
        <Pressable onPress={() => router.replace(ROUTES.TABS.TRIPS as "/")}>
          <Text style={styles.link}>Go home</Text>
        </Pressable>
      </View>
    );
  }

  const rt = snap?.realtime;
  const cache = snap?.cache;
  const chat = snap?.chat;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 32,
        paddingHorizontal: 16,
        gap: 14,
      }}
      refreshControl={
        <RefreshControl refreshing={false} onRefresh={refresh} />
      }
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Platform Health</Text>
        <Text style={styles.subtitle}>
          Scalability & Reliability · P0 · live client snapshot
        </Text>
        <Text style={styles.captured}>
          {snap?.capturedAt
            ? `Updated ${new Date(snap.capturedAt).toLocaleTimeString()}`
            : "Loading…"}
        </Text>
      </View>

      <Section title="Realtime">
        <MetricRow label="Status" value={rt?.status ?? "—"} />
        <MetricRow label="Active registry entries" value={rt?.activeRegistryEntries ?? 0} />
        <MetricRow label="Supabase channels" value={rt?.activeSupabaseChannels ?? 0} />
        <MetricRow label="Cap utilization %" value={rt?.capUtilizationPct ?? 0} />
        <MetricRow label="Opens" value={rt?.opens ?? 0} />
        <MetricRow label="Closes" value={rt?.closes ?? 0} />
        <MetricRow label="postgres_changes deliveries" value={rt?.postgresDeliveries ?? 0} />
        <MetricRow label="Broadcast deliveries" value={rt?.broadcastDeliveries ?? 0} />
        <MetricRow label="Cap breaches" value={rt?.capBreaches ?? 0} />
        <MetricRow label="Grace reattaches" value={rt?.graceReattaches ?? 0} />
      </Section>

      <Section title="Cache">
        <MetricRow label="setQueryData" value={cache?.setQueryData ?? 0} />
        <MetricRow label="invalidateQueries" value={cache?.invalidateQueries ?? 0} />
        <MetricRow label="refetchQueries" value={cache?.refetchQueries ?? 0} />
        <MetricRow label="Invalidation storms" value={cache?.invalidationStorms ?? 0} />
        <MetricRow
          label="Invalidations (last ~1s)"
          value={cache?.invalidationsLastWindow ?? 0}
        />
      </Section>

      <Section title="Database">
        <Text style={styles.note}>{snap?.database.note}</Text>
      </Section>

      <Section title="Chat Warnings">
        {(chat?.warnings.length ?? 0) === 0 ? (
          <Text style={styles.note}>No anomalies — all clear.</Text>
        ) : (
          chat!.warnings.map((w) => (
            <View key={w} style={styles.warningRow}>
              <Text style={styles.warningText}>⚠ {w}</Text>
            </View>
          ))
        )}
        <Text style={styles.note}>
          Watch lines only — nothing here auto-fixes. Cross-check against
          docs/CHAT_MIGRATION_DISCOVERIES_2026.md before acting.
        </Text>
      </Section>

      <Section title="Chat">
        <MetricRow label="Open threads" value={chat?.openThreads ?? 0} />
        <MetricRow label="Realtime channels" value={chat?.realtimeChannels ?? 0} />
        <MetricRow label="mark_conversation_read calls" value={chat?.markConversationReadCalls ?? 0} />
        <MetricRow label="mark_messages_seen calls" value={chat?.markMessagesSeenCalls ?? 0} />
        <MetricRow label="Images opened" value={chat?.imagesOpened ?? 0} />
        <MetricRow label="Images failed" value={chat?.imagesFailed ?? 0} />
        <MetricRow
          label="Avg chat open time"
          value={chat?.avgChatOpenMs != null ? `${chat.avgChatOpenMs}ms` : "—"}
        />
        <Text style={styles.note}>
          Session counters — reset on reload. Observation only, per
          docs/CHAT_MIGRATION_DISCOVERIES_2026.md.
        </Text>
      </Section>

      <Section title="Active channels">
        {(rt?.channels?.length ?? 0) === 0 ? (
          <Text style={styles.note}>No shared registry channels open.</Text>
        ) : (
          rt?.channels.map((ch) => (
            <View key={ch.key} style={styles.channelRow}>
              <Text style={styles.channelKey} numberOfLines={2}>
                {ch.key}
              </Text>
              <Text style={styles.channelMeta}>
                {ch.transport} · refs {ch.refs} · listeners {ch.listenerCount} ·{" "}
                {Math.round(ch.ageMs / 1000)}s
              </Text>
            </View>
          ))
        )}
      </Section>

      <Section title="Subscription budgets (law)">
        {snap
          ? Object.entries(snap.budgets.subscription).map(([k, v]) => (
              <MetricRow key={k} label={k} value={`≤ ${v}`} />
            ))
          : null}
      </Section>

      <Text style={styles.footer}>
        Charter: docs/SCALABILITY_PLATFORM.md · Open /platform-health anytime in
        eng builds.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  header: {
    gap: 4,
    marginBottom: 4,
  },
  back: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.primary,
    marginBottom: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    color: Theme.textMuted,
    fontWeight: "600",
  },
  captured: {
    fontSize: 11,
    color: Theme.textSecondary,
    marginTop: 2,
  },
  section: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    padding: 14,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginBottom: 2,
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  metricLabel: {
    flex: 1,
    fontSize: 13,
    color: Theme.textSecondary,
    fontWeight: "500",
  },
  metricValue: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  note: {
    fontSize: 12,
    lineHeight: 17,
    color: Theme.textMuted,
  },
  warningRow: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "rgba(217, 119, 6, 0.1)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(217, 119, 6, 0.35)",
  },
  warningText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#92400e",
    lineHeight: 16,
  },
  channelRow: {
    gap: 2,
    paddingVertical: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  channelKey: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  channelMeta: {
    fontSize: 10,
    color: Theme.textMuted,
  },
  footer: {
    fontSize: 11,
    color: Theme.textMuted,
    lineHeight: 15,
    marginTop: 4,
  },
  error: {
    fontSize: 14,
    color: Theme.negative,
    fontWeight: "600",
    paddingHorizontal: 16,
  },
  link: {
    marginTop: 12,
    marginHorizontal: 16,
    fontSize: 14,
    color: Theme.primary,
    fontWeight: "600",
  },
});
