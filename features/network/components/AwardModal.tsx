/**
 * AwardModal — Offer Hub modal for reviewing and awarding quotes.
 * Extracted from LoadCenterView.tsx.
 */
import Theme from "@/constants/Theme";
import { getIndentDisplayNumber, type IndentRow } from "@/features/indents";
import { IndentLiveBidsPanel } from "@/features/indents/components/IndentLiveBidsPanel";
import {
  indentReviewHubStyles,
  indentReviewHubText,
} from "@/features/indents/styles/indentReviewHubStyles";
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
            <View style={indentReviewHubStyles.reviewHubHero}>
              <View
                style={[
                  indentReviewHubStyles.reviewHubHeroGlow,
                  { pointerEvents: "none" },
                ]}
              />
              <Text style={indentReviewHubStyles.reviewHubHeroKicker}>
                Target route
              </Text>
              <Text style={indentReviewHubStyles.reviewHubHeroRoute} numberOfLines={3}>
                {(currentLoad.pickup_area || "—").toUpperCase()} →{" "}
                {(currentLoad.drop_location || "—").toUpperCase()}
              </Text>
              <View style={indentReviewHubStyles.reviewHubHeroMeta}>
                <View style={indentReviewHubStyles.reviewHubHeroMetaCol}>
                  <Text style={indentReviewHubStyles.reviewHubHeroStatLabel}>
                    Offers
                  </Text>
                  <Text
                    style={indentReviewHubStyles.reviewHubHeroStatValue}
                    numberOfLines={1}
                  >
                    {quotesLoading ? "—" : String(sortedQuotes.length)}
                  </Text>
                </View>
                {lowestPendingAmount != null && pendingCount > 0 ? (
                  <View style={indentReviewHubStyles.reviewHubHeroMetaColEnd}>
                    <Text style={indentReviewHubStyles.reviewHubHeroStatLabel}>
                      Lowest bid
                    </Text>
                    <Text
                      style={[
                        indentReviewHubStyles.reviewHubHeroStatValue,
                        indentReviewHubStyles.reviewHubHeroStatValueEnd,
                      ]}
                      numberOfLines={1}
                    >
                      {formatINR(lowestPendingAmount)}
                    </Text>
                  </View>
                ) : (
                  <View style={indentReviewHubStyles.reviewHubHeroMetaColEnd}>
                    <Text style={indentReviewHubStyles.reviewHubHeroStatLabel}>
                      Pending
                    </Text>
                    <Text
                      style={[
                        indentReviewHubStyles.reviewHubHeroStatValue,
                        indentReviewHubStyles.reviewHubHeroStatValueEnd,
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
              <ScrollView
                style={{ maxHeight: 360 }}
                showsVerticalScrollIndicator
              >
                <IndentLiveBidsPanel
                  quotes={sortedQuotes}
                  clientPriceInr={Number(currentLoad?.client_price ?? 0)}
                  targetRateInr={Number(currentLoad?.supplier_target ?? 0)}
                  pickupDateIso={currentLoad?.pickup_date}
                  selectedQuoteId={selectedQuoteId}
                  onSelectQuote={award.selectQuote}
                  canSelect={pendingCount > 0}
                />
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
    ...indentReviewHubText.partyTitle,
    fontSize: 12,
    textAlign: "center",
    width: "100%",
  },
  modalTitleCenter: {
    textAlign: "center",
    width: "100%",
  },
  modalSubtitle: indentReviewHubStyles.reviewHubModalSubtitle,
  bidEmptyWrap: { paddingVertical: 24, alignItems: "center" },
  bidEmptyText: {
    ...indentReviewHubText.sectionTitle,
    color: Theme.textMuted,
  },
  bidEmptySubtext: {
    ...indentReviewHubText.bodyMuted,
    marginTop: 6,
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
    ...indentReviewHubText.freightGridLabelDark,
    color: Theme.textOnDarkMuted,
    marginRight: 8,
  },
  quoteHeaderAmountDark: {
    ...indentReviewHubText.freightGridLabelDark,
    color: Theme.textOnDarkMuted,
    marginRight: 8,
  },
  quoteHeaderStatusDark: indentReviewHubText.freightGridLabelDark,
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
    ...indentReviewHubText.quoteRowName,
    color: Theme.textPrimaryDark,
    marginRight: 8,
  },
  quoteRowAmount: {
    ...indentReviewHubText.quoteRowAmount,
    color: Theme.textPrimaryDark,
    marginRight: 8,
  },
  quoteRowStatus: {
    ...indentReviewHubText.quoteRowStatus,
    color: Theme.textMuted,
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
