/**
 * AwardModal — Offer Hub modal for reviewing and awarding quotes.
 * Extracted from LoadCenterView.tsx.
 */
import Theme from "@/constants/Theme";
import { getIndentDisplayNumber, type DirectQuoteRow, type IndentRow } from "@/features/indents";
import { type AwardQuoteResult } from "@/features/network/hooks/useAwardQuote";
import { formatINR } from "@/lib/format";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { X } from "lucide-react-native";

interface AwardModalProps {
  visible: boolean;
  award: AwardQuoteResult;
  onViewIndent: (load: IndentRow) => void;
  insets: { top: number; bottom: number };
}

export function AwardModal({ visible, award, onViewIndent, insets }: AwardModalProps) {
  const { currentLoad, selectedQuoteId, awarding, sortedQuotes, pendingCount, lowestPendingAmount, quotesLoading } = award;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        award.close();
      }}
    >
      <TouchableOpacity
        style={styles.modalBackdrop}
        activeOpacity={1}
        onPress={() => {
          award.close();
        }}
      >
        <View
          style={[styles.modalSheet, { paddingBottom: 24 + insets.bottom }]}
        >
          <View style={styles.modalHandle} />
          <View style={styles.reviewHubModalHeader}>
            <TouchableOpacity
              onPress={() => {
                award.close();
              }}
              hitSlop={12}
              style={styles.reviewHubModalBack}
            >
              <X size={22} color={Theme.textPrimaryDark} strokeWidth={2.5} />
            </TouchableOpacity>
            <View style={styles.modalHeaderTitleWrap}>
              <Text style={[styles.modalTitle, styles.modalTitleCenter]}>
                Review Hub
              </Text>
              {currentLoad ? (
                <Text style={styles.modalSubtitle}>
                  Audit indent {getIndentDisplayNumber(currentLoad)}
                </Text>
              ) : null}
            </View>
            <View style={styles.reviewHubModalHeaderSpacer} />
          </View>
          {currentLoad ? (
            <View style={styles.reviewHubHero}>
              <View
                style={[styles.reviewHubHeroGlow, { pointerEvents: "none" }]}
              />
              <Text style={styles.reviewHubHeroKicker}>Target route</Text>
              <Text style={styles.reviewHubHeroRoute} numberOfLines={3}>
                {(currentLoad.pickup_area || "—").toUpperCase()} →{" "}
                {(currentLoad.drop_location || "—").toUpperCase()}
              </Text>
              <View style={styles.reviewHubHeroMeta}>
                <View style={styles.reviewHubHeroMetaCol}>
                  <Text style={styles.reviewHubHeroStatLabel}>Offers</Text>
                  <Text style={styles.reviewHubHeroStatValue} numberOfLines={1}>
                    {quotesLoading ? "—" : String(sortedQuotes.length)}
                  </Text>
                </View>
                {lowestPendingAmount != null && pendingCount > 0 ? (
                  <View style={styles.reviewHubHeroMetaColEnd}>
                    <Text style={styles.reviewHubHeroStatLabel}>
                      Lowest bid
                    </Text>
                    <Text
                      style={[
                        styles.reviewHubHeroStatValue,
                        styles.reviewHubHeroStatValueEnd,
                      ]}
                      numberOfLines={1}
                    >
                      {formatINR(lowestPendingAmount)}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.reviewHubHeroMetaColEnd}>
                    <Text style={styles.reviewHubHeroStatLabel}>Pending</Text>
                    <Text
                      style={[
                        styles.reviewHubHeroStatValue,
                        styles.reviewHubHeroStatValueEnd,
                      ]}
                      numberOfLines={1}
                    >
                      {String(pendingCount)}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          ) : null}
          {quotesLoading ? (
            <View style={styles.bidEmptyWrap}>
              <ActivityIndicator size="small" color={Theme.primary} />
              <Text style={styles.bidEmptyText}>Loading offers…</Text>
            </View>
          ) : sortedQuotes.length === 0 ? (
            <View style={styles.bidEmptyWrap}>
              <FontAwesome
                name="inbox"
                size={32}
                color={Theme.textMuted}
                style={{ marginBottom: 12 }}
              />
              <Text style={styles.bidEmptyText}>No offers yet</Text>
              <Text style={styles.bidEmptySubtext}>
                Share this load to get offers from your network.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.quoteHeaderRowDark}>
                <Text style={styles.quoteHeaderNameDark}>Bidder</Text>
                <Text style={styles.quoteHeaderAmountDark}>Amount</Text>
                <Text style={styles.quoteHeaderStatusDark}>Status</Text>
              </View>
              <ScrollView
                style={{ maxHeight: 280 }}
                showsVerticalScrollIndicator
              >
                {sortedQuotes.map((q: DirectQuoteRow) => {
                  const isPending =
                    (q.status || "").toLowerCase() === "pending";
                  const isSelected = selectedQuoteId === q.id;
                  return (
                    <TouchableOpacity
                      key={q.id}
                      style={[
                        styles.quoteRow,
                        isSelected && styles.quoteRowSelected,
                        !isPending && styles.quoteRowDisabled,
                      ]}
                      onPress={() =>
                        isPending &&
                        award.selectQuote(isSelected ? null : q.id)
                      }
                      activeOpacity={0.8}
                      disabled={!isPending}
                    >
                      <Text style={styles.quoteRowName} numberOfLines={1}>
                        {q.bidder_organization_name ?? "—"}
                      </Text>
                      <Text style={styles.quoteRowAmount}>
                        {formatINR(Number(q.amount ?? 0))}
                      </Text>
                      <Text style={styles.quoteRowStatus}>
                        {(q.status || "").toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {pendingCount === 0 && (
                <Text style={styles.bidEmptySubtext}>
                  No pending offers to award.
                </Text>
              )}
              {pendingCount > 0 && (
                <Text style={styles.bidEmptySubtext}>
                  Tap an offer to select, then Award selected.
                </Text>
              )}
            </>
          )}
          {currentLoad && (
            <>
              <TouchableOpacity
                style={[styles.modalSubmit, { marginTop: 16 }]}
                onPress={() => void award.award()}
                activeOpacity={0.9}
                disabled={
                  awarding ||
                  !selectedQuoteId ||
                  !sortedQuotes.some(
                    (q) =>
                      q.id === selectedQuoteId &&
                      (q.status || "").toLowerCase() === "pending",
                  )
                }
              >
                <Text style={styles.modalSubmitText}>
                  {awarding ? "Awarding…" : "Award selected"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.viewIndentBtn}
                onPress={() => {
                  award.close();
                  onViewIndent(currentLoad);
                }}
                activeOpacity={0.9}
              >
                <Text style={styles.viewIndentBtnText}>View Indent</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 12,
    minWidth: 0,
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
  reviewHubHero: {
    borderRadius: 28,
    backgroundColor: Theme.textPrimaryDark,
    padding: 18,
    marginBottom: 16,
    overflow: "hidden",
  },
  reviewHubHeroGlow: {
    position: "absolute",
    top: -40,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  reviewHubHeroKicker: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    marginBottom: 8,
    fontStyle: "italic",
  },
  reviewHubHeroRoute: {
    fontSize: 18,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: -0.2,
    lineHeight: 24,
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
  bidEmptyWrap: { paddingVertical: 32, alignItems: "center" },
  bidEmptyText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  bidEmptySubtext: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 8,
    textAlign: "center",
  },
  quoteHeaderRowDark: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Theme.textPrimaryDark,
    borderRadius: 14,
    marginBottom: 8,
  },
  quoteHeaderNameDark: {
    flex: 1,
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    marginRight: 8,
    letterSpacing: 0.6,
    fontStyle: "italic",
  },
  quoteHeaderAmountDark: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    marginRight: 8,
    letterSpacing: 0.6,
    fontStyle: "italic",
  },
  quoteHeaderStatusDark: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontStyle: "italic",
  },
  quoteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  quoteRowSelected: {
    backgroundColor: Theme.surfaceGray,
    borderLeftWidth: 4,
    borderLeftColor: Theme.teslaRed,
  },
  quoteRowDisabled: { opacity: 0.6 },
  quoteRowName: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginRight: 8,
  },
  quoteRowAmount: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginRight: 8,
  },
  quoteRowStatus: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
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
  },
  modalSubmitText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  viewIndentBtn: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 12,
  },
  viewIndentBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
});
