/**
 * P0.5: Fuzzy match sheet for confirming which platform org a raw counterparty
 * name belongs to. Three tiers:
 *   ≥0.8  — single auto-suggestion ("Is this X?")
 *   0.55–0.79 — ranked list with radio selection
 *   no match — free-text search with debounce
 *
 * Uses Modal (not @gorhom/bottom-sheet) to match existing codebase patterns.
 * Dismissal is persisted to AsyncStorage for 30 days.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import Theme from "@/constants/Theme";
import {
  findOrgMatchesForCounterparty,
  type OrgMatch,
  type UnlinkedCounterparty,
} from "@/features/network/services/counterparties.service";
import { Search, X } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DISMISSAL_PREFIX = "dismissed_counterparty";
const DISMISSAL_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function dismissalKey(orgId: string, name: string) {
  return `${DISMISSAL_PREFIX}:${orgId}:${name}`;
}

export async function isCounterpartyDismissed(
  orgId: string,
  name: string,
): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(dismissalKey(orgId, name));
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    return Date.now() - ts < DISMISSAL_TTL_MS;
  } catch {
    return false;
  }
}

async function writeDismissal(orgId: string, name: string): Promise<void> {
  try {
    await AsyncStorage.setItem(dismissalKey(orgId, name), String(Date.now()));
  } catch {
    // Silently fail — dismissal is a UX convenience, not data integrity
  }
}

type Props = {
  orgId: string;
  target: UnlinkedCounterparty | null;
  onClose: () => void;
  onConfirm: (matchedOrgId: string | null) => void;
  /**
   * Optional phone number associated with the counterparty (e.g. from a
   * linked client/supplier record). When provided, boosts matching score
   * for orgs with the same normalized phone. Phone is a ranking signal only
   * — it does not trigger automatic linking.
   */
  targetPhone?: string | null;
};

export function CounterpartyLinkConfirmSheet({
  orgId,
  target,
  onClose,
  onConfirm,
  targetPhone,
}: Props) {
  const insets = useSafeAreaInsets();
  const [matches, setMatches] = useState<OrgMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchMatches = useCallback(
    async (name: string, phone?: string | null) => {
      if (!name.trim()) {
        setMatches([]);
        return;
      }
      setLoadingMatches(true);
      const res = await findOrgMatchesForCounterparty(name.trim(), {
        phone: phone ?? null,
      });
      setMatches(res.error ? [] : res.matches);
      setLoadingMatches(false);
    },
    [],
  );

  // Load initial matches when sheet opens
  useEffect(() => {
    if (!target) {
      setMatches([]);
      setSearchText("");
      setSelectedOrgId(null);
      return;
    }
    void fetchMatches(target.counterparty_name, targetPhone);
  }, [target, targetPhone, fetchMatches]);

  // Debounce free-text search input — phone bonus still applies during search
  useEffect(() => {
    if (!searchText) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchMatches(searchText, targetPhone);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchText, targetPhone, fetchMatches]);

  if (!target) return null;

  const topMatch = matches[0] ?? null;
  const hasAutoSuggest = topMatch !== null && topMatch.similarity_score >= 0.8;
  const hasRankedList =
    !hasAutoSuggest && matches.length > 0 && topMatch.similarity_score >= 0.55;
  const showFreeText = !hasAutoSuggest && !hasRankedList;

  const handleDismiss = async () => {
    await writeDismissal(orgId, target.counterparty_name);
    onConfirm(null);
  };

  const handleConfirmSelection = () => {
    const orgId = selectedOrgId ?? (hasAutoSuggest ? topMatch?.org_id ?? null : null);
    onConfirm(orgId);
  };

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouch} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerHandle} />
            <Pressable
              style={({ pressed }) => [
                styles.closeBtn,
                pressed && { opacity: 0.7 },
              ]}
              onPress={onClose}
              hitSlop={8}
            >
              <X size={14} color={Theme.textPrimaryDark} strokeWidth={2.4} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.title}>Connect "{target.counterparty_name}"</Text>
            <Text style={styles.subtitle}>
              Find the organization on Pulse to link it to your{" "}
              {target.trip_count} {target.trip_count === 1 ? "trip" : "trips"}.
            </Text>

            {/* Auto-suggest tier */}
            {hasAutoSuggest && (
              <View style={styles.autoSuggestCard}>
                <Text style={styles.autoSuggestLabel}>Possible match found</Text>
                <View style={styles.autoSuggestRow}>
                  <View style={styles.autoSuggestInfo}>
                    <Text style={styles.autoSuggestName} numberOfLines={1}>
                      {topMatch.org_name}
                    </Text>
                    {topMatch.org_city ? (
                      <Text style={styles.autoSuggestCity} numberOfLines={1}>
                        {topMatch.org_city}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.scoreChip}>
                    <Text style={styles.scoreChipText}>
                      {Math.round(topMatch.similarity_score * 100)}% match
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Ranked list tier */}
            {hasRankedList && (
              <View style={styles.rankedList}>
                <Text style={styles.rankedListLabel}>Select the correct match:</Text>
                {matches.map((m) => (
                  <Pressable
                    key={m.org_id}
                    style={[
                      styles.rankedItem,
                      selectedOrgId === m.org_id && styles.rankedItemSelected,
                    ]}
                    onPress={() =>
                      setSelectedOrgId((prev) =>
                        prev === m.org_id ? null : m.org_id,
                      )
                    }
                  >
                    <View style={styles.rankedItemInfo}>
                      <Text style={styles.rankedItemName} numberOfLines={1}>
                        {m.org_name}
                      </Text>
                      {m.org_city ? (
                        <Text style={styles.rankedItemCity} numberOfLines={1}>
                          {m.org_city}
                        </Text>
                      ) : null}
                    </View>
                    <View
                      style={[
                        styles.radioOuter,
                        selectedOrgId === m.org_id && styles.radioOuterSelected,
                      ]}
                    >
                      {selectedOrgId === m.org_id ? (
                        <View style={styles.radioInner} />
                      ) : null}
                    </View>
                  </Pressable>
                ))}
              </View>
            )}

            {/* Free-text search tier */}
            {showFreeText && (
              <View style={styles.searchSection}>
                <Text style={styles.rankedListLabel}>
                  Search for the organization:
                </Text>
                <View style={styles.searchBox}>
                  <Search size={14} color={Theme.textSecondary} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Company name…"
                    placeholderTextColor={Theme.textSecondary}
                    value={searchText}
                    onChangeText={setSearchText}
                    autoCapitalize="words"
                    returnKeyType="search"
                    autoFocus
                  />
                  {loadingMatches ? (
                    <ActivityIndicator size="small" color={Theme.primary} />
                  ) : null}
                </View>
                {matches.length > 0 && (
                  <View style={styles.rankedList}>
                    {matches.map((m) => (
                      <Pressable
                        key={m.org_id}
                        style={[
                          styles.rankedItem,
                          selectedOrgId === m.org_id && styles.rankedItemSelected,
                        ]}
                        onPress={() =>
                          setSelectedOrgId((prev) =>
                            prev === m.org_id ? null : m.org_id,
                          )
                        }
                      >
                        <View style={styles.rankedItemInfo}>
                          <Text style={styles.rankedItemName} numberOfLines={1}>
                            {m.org_name}
                          </Text>
                          {m.org_city ? (
                            <Text style={styles.rankedItemCity} numberOfLines={1}>
                              {m.org_city}
                            </Text>
                          ) : null}
                        </View>
                        <View
                          style={[
                            styles.radioOuter,
                            selectedOrgId === m.org_id &&
                              styles.radioOuterSelected,
                          ]}
                        >
                          {selectedOrgId === m.org_id ? (
                            <View style={styles.radioInner} />
                          ) : null}
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            {hasAutoSuggest ? (
              <>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionBtn,
                    styles.actionBtnPrimary,
                    pressed && { opacity: 0.88 },
                  ]}
                  onPress={() => onConfirm(topMatch.org_id)}
                >
                  <Text style={styles.actionBtnPrimaryText}>
                    Yes, that's them
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionBtn,
                    styles.actionBtnSecondary,
                    pressed && { opacity: 0.72 },
                  ]}
                  onPress={() => void handleDismiss()}
                >
                  <Text style={styles.actionBtnSecondaryText}>
                    Not a match
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionBtn,
                    styles.actionBtnPrimary,
                    !selectedOrgId && styles.actionBtnDisabled,
                    pressed && selectedOrgId && { opacity: 0.88 },
                  ]}
                  onPress={handleConfirmSelection}
                  disabled={!selectedOrgId}
                >
                  <Text
                    style={[
                      styles.actionBtnPrimaryText,
                      !selectedOrgId && styles.actionBtnPrimaryTextDisabled,
                    ]}
                  >
                    Confirm link
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionBtn,
                    styles.actionBtnSecondary,
                    pressed && { opacity: 0.72 },
                  ]}
                  onPress={() => void handleDismiss()}
                >
                  <Text style={styles.actionBtnSecondaryText}>
                    Skip for 30 days
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.42)",
    justifyContent: "flex-end",
  },
  backdropTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: Theme.borderLight,
    maxHeight: "88%",
  },
  header: {
    alignItems: "center",
    paddingTop: 12,
    paddingHorizontal: 14,
    paddingBottom: 8,
    flexDirection: "row",
    justifyContent: "center",
  },
  headerHandle: {
    position: "absolute",
    top: 10,
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.borderLight,
    alignSelf: "center",
  },
  closeBtn: {
    position: "absolute",
    right: 14,
    top: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 16,
    gap: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: Theme.textSecondary,
    lineHeight: 18,
    marginTop: -8,
  },
  autoSuggestCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.networkHubListCardPrimaryTintBorder,
    backgroundColor: Theme.networkHubListCardPrimaryTintBg,
    padding: 12,
    gap: 8,
  },
  autoSuggestLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.primary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  autoSuggestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  autoSuggestInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  autoSuggestName: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  autoSuggestCity: {
    fontSize: 11,
    color: Theme.textSecondary,
  },
  scoreChip: {
    borderRadius: 8,
    backgroundColor: Theme.positiveMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(21,128,61,0.2)",
  },
  scoreChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.positive,
  },
  rankedList: {
    gap: 6,
  },
  rankedListLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
    marginBottom: 4,
  },
  rankedItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  rankedItemSelected: {
    borderColor: Theme.primary,
    backgroundColor: Theme.networkHubListCardPrimaryTintBg,
  },
  rankedItemInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rankedItemName: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  rankedItemCity: {
    fontSize: 11,
    color: Theme.textSecondary,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  radioOuterSelected: {
    borderColor: Theme.primary,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.primary,
  },
  searchSection: {
    gap: 8,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textPrimary,
  },
  actions: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  actionBtn: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnPrimary: {
    backgroundColor: Theme.primary,
  },
  actionBtnPrimaryText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  actionBtnPrimaryTextDisabled: {
    color: "rgba(255,255,255,0.5)",
  },
  actionBtnDisabled: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  actionBtnSecondary: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  actionBtnSecondaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
});
