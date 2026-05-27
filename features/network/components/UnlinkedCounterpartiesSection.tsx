/**
 * Feature-flagged section surfacing unlinked counterparties (trips where
 * supplier_id/client_id is null but the name string exists).
 * Hidden when flag is off or when there are 0 results.
 */
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { useUnlinkedCounterpartiesQuery } from "@/lib/queries/useUnlinkedCounterpartiesQuery";
import { UnlinkedCounterpartyCard } from "@/features/network/components/UnlinkedCounterpartyCard";
import { CounterpartyLinkConfirmSheet } from "@/features/network/components/CounterpartyLinkConfirmSheet";
import { useLinkCounterpartyMutation } from "@/lib/queries/useUnlinkedCounterpartiesQuery";
import type { UnlinkedCounterparty } from "@/features/network/services/counterparties.service";
import { Link2 } from "lucide-react-native";
import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

// Kill switch — keep false until 48h soak passes cleanly.
// Flip to true for internal orgs; flip globally when stable.
export const ENABLE_UNLINKED_COUNTERPARTIES = false;

type Props = {
  orgId: string;
};

function SkeletonCard() {
  return (
    <View style={skeletonStyles.card}>
      <View style={skeletonStyles.iconWrap} />
      <View style={skeletonStyles.body}>
        <View style={skeletonStyles.titleLine} />
        <View style={skeletonStyles.subtitleLine} />
      </View>
      <View style={skeletonStyles.btn} />
    </View>
  );
}

/**
 * The kill switch must short-circuit BEFORE any data hook fires.
 * Otherwise `useUnlinkedCounterpartiesQuery` will call the
 * `get_unlinked_counterparties` RPC on every render, and until the
 * migration ships on remote the call fails with
 *   "Could not find the function public.get_unlinked_counterparties"
 * which then triggers TanStack retries / loading state forever.
 *
 * Hooks live in `UnlinkedCounterpartiesSectionInner`; the outer
 * wrapper just decides whether to mount it.
 */
export function UnlinkedCounterpartiesSection({ orgId }: Props) {
  if (!ENABLE_UNLINKED_COUNTERPARTIES) return null;
  return <UnlinkedCounterpartiesSectionInner orgId={orgId} />;
}

function UnlinkedCounterpartiesSectionInner({ orgId }: Props) {
  const { data, isLoading, isError, refetch } =
    useUnlinkedCounterpartiesQuery(orgId);
  const linkMutation = useLinkCounterpartyMutation(orgId);
  const [sheetTarget, setSheetTarget] =
    useState<UnlinkedCounterparty | null>(null);

  if (isLoading) {
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Link2 size={11} color={Theme.textSecondary} strokeWidth={2.2} />
            <Text style={styles.sectionKicker}>Trip history</Text>
            <Text style={styles.sectionHeading}>Unlinked partners</Text>
          </View>
        </View>
        <View style={styles.list}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Link2 size={11} color={Theme.textSecondary} strokeWidth={2.2} />
            <Text style={styles.sectionKicker}>Trip history</Text>
            <Text style={styles.sectionHeading}>Unlinked partners</Text>
          </View>
        </View>
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>Couldn't load unlinked partners.</Text>
          <Pressable
            onPress={() => void refetch()}
            style={({ pressed }) => [
              styles.retryBtn,
              pressed && { opacity: 0.72 },
            ]}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Hide section entirely when no results — no empty state noise.
  if (!data || data.length === 0) return null;

  return (
    <>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Link2 size={11} color={Theme.textSecondary} strokeWidth={2.2} />
            <View style={styles.sectionTitleBlock}>
              <Text style={styles.sectionKicker}>From your trip history</Text>
              <Text style={styles.sectionHeading}>Unlinked partners</Text>
            </View>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{data.length}</Text>
          </View>
        </View>
        <View style={styles.list}>
          {data.map((item) => (
            <UnlinkedCounterpartyCard
              key={`${item.counterparty_type}:${item.counterparty_name}`}
              item={item}
              onConnectPress={setSheetTarget}
            />
          ))}
        </View>
      </View>

      <CounterpartyLinkConfirmSheet
        orgId={orgId}
        target={sheetTarget}
        onClose={() => setSheetTarget(null)}
        onConfirm={(matchedOrgId) => {
          if (!sheetTarget) return;
          linkMutation.mutate({
            orgId,
            counterpartyName: sheetTarget.counterparty_name,
            counterpartyType: sheetTarget.counterparty_type,
            matchedOrgId,
            dismissed: matchedOrgId === null,
          });
          setSheetTarget(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginTop: 10,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flex: 1,
    minWidth: 0,
  },
  sectionTitleBlock: {
    gap: 1,
  },
  sectionKicker: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.6,
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  countBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  list: {
    gap: 8,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: Theme.textSecondary,
  },
  retryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  retryText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
});

const skeletonStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Theme.screenBackground,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  titleLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: Theme.surface,
    width: "55%",
  },
  subtitleLine: {
    height: 10,
    borderRadius: 5,
    backgroundColor: Theme.surface,
    width: "35%",
  },
  btn: {
    width: 68,
    height: 30,
    borderRadius: 8,
    backgroundColor: Theme.surface,
    flexShrink: 0,
  },
});
