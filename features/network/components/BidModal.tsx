/**
 * BidModal — Submit Quotation (Bid Hub) modal.
 * Extracted from LoadCenterView.tsx.
 */
import { SmartInput } from "@/components/mobile-input";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { createDirectQuote, getIndentDisplayNumber, type DirectQuoteRow, type IndentRow } from "@/features/indents";
import { useInvalidateIndents } from "@/lib/queries";
import { queryKeys } from "@/lib/queryKeys";
import { formatINR } from "@/lib/format";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { type QueryClient } from "@tanstack/react-query";
import { X } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface BidModalProps {
  visible: boolean;
  load: IndentRow | null;
  orgId: string | null;
  myQuoteByIndentId: Map<string, DirectQuoteRow>;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  localBidHistoryByIndentId: Record<
    string,
    { amount: number; updatedAt: string }[]
  >;
  onUpdateLocalBidHistory: (
    indentId: string,
    entry: { amount: number; updatedAt: string },
  ) => void;
  queryClient: QueryClient;
  invalidateIndents: ReturnType<typeof useInvalidateIndents>;
  refetchMyQuotes: () => void;
  refetchMarketIndents: () => void;
  insets: { top: number; bottom: number };
}

export function BidModal({
  visible,
  load,
  orgId,
  myQuoteByIndentId,
  onClose,
  onSuccess,
  localBidHistoryByIndentId,
  onUpdateLocalBidHistory,
  queryClient,
  invalidateIndents,
  refetchMyQuotes,
  refetchMarketIndents,
  insets,
}: BidModalProps) {
  const [quoteAmount, setQuoteAmount] = useState<string>("");
  const [submittingQuote, setSubmittingQuote] = useState(false);

  const activeBidQuote = useMemo(() => {
    if (!load) return null;
    return myQuoteByIndentId.get(load.id) ?? null;
  }, [load, myQuoteByIndentId]);

  const activeBidQuoteUpdatedAt = useMemo(() => {
    if (!activeBidQuote?.updated_at) return null;
    const parsed = new Date(activeBidQuote.updated_at);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [activeBidQuote?.updated_at]);

  const activeBidHistory = useMemo(() => {
    if (!load) return [];
    const indentId = load.id;
    const localHistory = localBidHistoryByIndentId[indentId] ?? [];
    return localHistory
      .filter((entry) => Number.isFinite(Number(entry.amount)))
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }, [load, localBidHistoryByIndentId]);

  const handleClose = () => {
    setQuoteAmount("");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.bidModalPage}
      >
        <View
          style={[
            styles.modalSheet,
            styles.bidModalSheetFull,
            {
              paddingTop: insets.top + 12,
              paddingBottom: 24 + insets.bottom,
            },
          ]}
        >
          <View style={styles.modalHandle} />
          <View style={styles.reviewHubModalHeader}>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={12}
              style={styles.reviewHubModalBack}
            >
              <X size={22} color={Theme.textPrimaryDark} strokeWidth={2.5} />
            </TouchableOpacity>
            <View style={styles.modalHeaderTitleWrap}>
              <Text style={[styles.modalTitle, styles.modalTitleCenter]}>
                Bid hub
              </Text>
              <Text style={styles.modalSubtitle}>Submit quotation</Text>
            </View>
            <View style={styles.reviewHubModalHeaderSpacer} />
          </View>
          <ScrollView
            style={styles.bidModalScroll}
            contentContainerStyle={styles.bidModalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {load ? (
              <View style={styles.bidIndentDetailSection}>
                <View style={styles.bidHubHero}>
                  <View
                    style={[styles.bidHubHeroGlow, { pointerEvents: "none" }]}
                  />
                  <Text style={styles.bidHubHeroKicker}>
                    You are bidding on
                  </Text>
                  <Text style={styles.bidHubHeroRoute} numberOfLines={4}>
                    {(load.pickup_area || "—").trim()} →{" "}
                    {(load.drop_location || "—").trim()}
                  </Text>
                  <View style={styles.bidHubHeroChips}>
                    {load.load_type ? (
                      <View style={styles.bidHubChip}>
                        <Text style={styles.bidHubChipText} numberOfLines={1}>
                          {String(load.load_type).toUpperCase()}
                        </Text>
                      </View>
                    ) : null}
                    {load.vehicle_type ? (
                      <View style={styles.bidHubChip}>
                        <Text style={styles.bidHubChipText} numberOfLines={1}>
                          {load.vehicle_type}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={[styles.reviewHubHeroMeta, { marginTop: 14 }]}>
                    <View style={styles.reviewHubHeroMetaCol}>
                      <Text style={styles.reviewHubHeroStatLabel}>
                        Indent
                      </Text>
                      <Text
                        style={styles.reviewHubHeroStatValue}
                        numberOfLines={1}
                      >
                        {getIndentDisplayNumber(load)}
                      </Text>
                    </View>
                    <View style={styles.reviewHubHeroMetaColEnd}>
                      <Text style={styles.reviewHubHeroStatLabel}>
                        Target
                      </Text>
                      <Text
                        style={[
                          styles.reviewHubHeroStatValue,
                          styles.reviewHubHeroStatValueEnd,
                        ]}
                        numberOfLines={1}
                      >
                        {formatINR(
                          Number(
                            load.supplier_target ?? load.client_price ?? 0,
                          ),
                        )}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            ) : null}
            <View style={styles.bidInputBlock}>
              <Text style={styles.bidSectionTitle}>Financial proposal</Text>
              <SmartInput
                type="currency"
                label="Your price"
                context={
                  load
                    ? (() => {
                        const target = load.supplier_target ?? load.client_price;
                        return target != null && Number(target) > 0
                          ? `Target rate: ${formatINR(Number(target))}`
                          : undefined;
                      })()
                    : undefined
                }
                value={quoteAmount}
                onChange={(raw) => setQuoteAmount(raw)}
                variant="field"
                placeholder="Enter bid amount"
                allowDecimal={false}
              />
              {activeBidQuote ? (
                <View style={styles.previousBidWrap}>
                  <Text style={styles.previousBidLabel}>Previous bid</Text>
                  <Text style={styles.previousBidValue}>
                    {formatINR(Number(activeBidQuote.amount ?? 0))}
                  </Text>
                  {activeBidQuoteUpdatedAt ? (
                    <Text style={styles.previousBidMeta}>
                      Last updated: {activeBidQuoteUpdatedAt}
                    </Text>
                  ) : null}
                  {activeBidHistory.length > 0 ? (
                    <View style={styles.previousBidHistoryWrap}>
                      <Text style={styles.previousBidHistoryTitle}>
                        Earlier updates
                      </Text>
                      {activeBidHistory.map((entry, idx) => {
                        const dt = new Date(entry.updatedAt);
                        const readable = Number.isNaN(dt.getTime())
                          ? "Unknown time"
                          : dt.toLocaleString("en-IN", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            });
                        return (
                          <View
                            key={`${entry.updatedAt}-${entry.amount}-${idx}`}
                            style={styles.previousBidHistoryRow}
                          >
                            <Text style={styles.previousBidHistoryAmount}>
                              {formatINR(Number(entry.amount ?? 0))}
                            </Text>
                            <Text style={styles.previousBidHistoryDate}>
                              {readable}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
            <TouchableOpacity
              style={styles.modalSubmit}
              onPress={async () => {
                if (!orgId || !load) {
                  return;
                }
                const value = Number(
                  String(quoteAmount).replace(/,/g, "").trim(),
                );
                if (!Number.isFinite(value) || value <= 0) {
                  Alert.alert(
                    "Invalid amount",
                    "Please enter a valid quote amount.",
                  );
                  return;
                }
                const hadExistingQuote = !!myQuoteByIndentId.get(load.id);
                const existingQuoteBeforeSave = myQuoteByIndentId.get(load.id);
                try {
                  setSubmittingQuote(true);
                  const { error } = await createDirectQuote(
                    load.id,
                    orgId,
                    value,
                    null,
                    null,
                    null,
                  );
                  setSubmittingQuote(false);
                  if (error) {
                    Alert.alert("Could not publish offer", error.message);
                    refetchMarketIndents();
                    return;
                  }
                  invalidateIndents(orgId);
                  await Promise.allSettled([
                    queryClient.invalidateQueries({
                      queryKey: [
                        ...queryKeys.indents.all(orgId),
                        "my-direct-quotes",
                      ],
                    }),
                    queryClient.invalidateQueries({
                      queryKey: ["indents", load.id, "direct-quotes"],
                    }),
                    queryClient.invalidateQueries({
                      queryKey: ["indents", "quote-counts"],
                    }),
                    refetchMyQuotes(),
                    refetchMarketIndents(),
                  ]);
                  onSuccess(
                    hadExistingQuote ? "Quote updated" : "Offer Published",
                  );
                  if (existingQuoteBeforeSave) {
                    onUpdateLocalBidHistory(load.id, {
                      amount: Number(existingQuoteBeforeSave.amount ?? 0),
                      updatedAt:
                        existingQuoteBeforeSave.updated_at ??
                        new Date().toISOString(),
                    });
                  }
                  setQuoteAmount("");
                  onClose();
                } catch (e) {
                  setSubmittingQuote(false);
                  const msg =
                    e instanceof Error
                      ? e.message
                      : "Unknown error while publishing offer.";
                  Alert.alert("Could not publish offer", msg);
                  refetchMarketIndents();
                }
              }}
              activeOpacity={0.9}
              disabled={submittingQuote}
            >
              <Text style={styles.modalSubmitText}>
                {submittingQuote ? "Submitting…" : "Submit bid"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bidModalPage: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    justifyContent: "flex-end",
    minWidth: 0,
    ...Platform.select({
      web: { maxWidth: "100%" as const },
    }),
  },
  modalSheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 12,
    minWidth: 0,
    ...Platform.select({
      web: { maxWidth: "100%" as const },
    }),
  },
  bidModalSheetFull: {
    flex: 1,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    ...Platform.select({
      web: { minWidth: 0, maxWidth: "100%" as const },
    }),
  },
  modalHandle: {
    width: 48,
    height: 4,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 24,
  },
  reviewHubModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  reviewHubModalBack: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  reviewHubModalHeaderSpacer: {
    width: 44,
    height: 44,
  },
  modalHeaderTitleWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    fontStyle: "italic",
  },
  modalTitleCenter: {
    textAlign: "center",
    width: "100%",
  },
  modalSubtitle: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.6,
    marginTop: 4,
    textAlign: "center",
  },
  bidModalScroll: {
    flex: 1,
    alignSelf: "stretch",
    minWidth: 0,
    ...Platform.select({
      web: { width: "100%" as const, maxWidth: "100%" as const },
    }),
  },
  bidModalScrollContent: {
    flexGrow: 1,
    paddingBottom: 8,
    ...Platform.select({
      web: { minWidth: 0, maxWidth: "100%" as const },
    }),
  },
  bidIndentDetailSection: {
    marginTop: 8,
    width: "100%",
    alignSelf: "stretch",
    marginBottom: 12,
  },
  bidHubHero: {
    borderRadius: 28,
    backgroundColor: Theme.textPrimaryDark,
    padding: 18,
    marginBottom: 16,
    overflow: "hidden",
    minWidth: 0,
    alignSelf: "stretch",
    ...Platform.select({
      web: { maxWidth: "100%" as const },
    }),
  },
  bidHubHeroGlow: {
    position: "absolute",
    top: -36,
    right: -36,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  bidHubHeroKicker: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  bidHubHeroRoute: {
    fontSize: 17,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    lineHeight: 22,
    marginBottom: 10,
  },
  bidHubHeroChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  bidHubChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
  },
  bidHubChipText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
  },
  reviewHubHeroMeta: {
    flexDirection: "row",
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderOnDark,
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
    minWidth: 0,
  },
  reviewHubHeroMetaCol: {
    flex: 1,
    minWidth: 0,
  },
  reviewHubHeroMetaColEnd: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "58%",
    alignItems: "flex-end",
  },
  reviewHubHeroStatValueEnd: {
    textAlign: "right",
    alignSelf: "stretch",
  },
  reviewHubHeroStatLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  reviewHubHeroStatValue: {
    fontSize: 13,
    fontWeight: "900",
    color: Theme.textOnDark,
  },
  bidSectionTitle: {
    fontSize: 11,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  bidInputBlock: {
    width: "100%",
    alignSelf: "stretch",
    marginTop: 6,
    marginBottom: 24,
  },
  quoteLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  quoteInput: {
    width: "100%",
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    minHeight: 48,
    ...Platform.select({
      web: {
        outlineStyle: "none",
        fontSize: 16,
        lineHeight: 22,
        maxWidth: "100%",
      } as any,
    }),
  },
  previousBidWrap: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
  },
  previousBidLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  previousBidValue: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  previousBidMeta: {
    marginTop: 2,
    fontSize: 10,
    color: Theme.textSecondary,
  },
  previousBidHistoryWrap: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    gap: 6,
  },
  previousBidHistoryTitle: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  previousBidHistoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  previousBidHistoryAmount: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  previousBidHistoryDate: {
    fontSize: 10,
    color: Theme.textSecondary,
  },
  modalSubmit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    backgroundColor: Theme.darkBackground,
    borderRadius: 12,
    alignSelf: "stretch",
    minWidth: 0,
    ...Platform.select({
      web: { width: "100%" as const, maxWidth: "100%" as const },
    }),
  },
  modalSubmitText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
});
