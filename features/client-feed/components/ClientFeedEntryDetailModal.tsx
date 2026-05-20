/**
 * Client Feed entry detail bottom sheet.
 *
 * Three behaviors derived from entry.match:
 *   NEW        → one-tap "Add to My Books" (creates local ledger entry from the feed entry)
 *   DUPLICATE  → "Link & Reconcile" / "Review Differences" / "Ignore"
 *   MISMATCH   → side-by-side Client vs Your entry, "Adjust & Add" / "Raise Dispute"
 *   ACTIONED   → read-only pill showing what was done (with undo for Ignore)
 *
 * All actions go through existing infrastructure:
 *   createLedgerEntry (finance.service)
 *   createDispute (sharedLedgerService)
 *   setClientFeedEntryStatus (local AsyncStorage)
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import { createLedgerEntry } from "@/features/finance/services/finance.service";
import { createDispute } from "@/services/sharedLedgerService";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  setClientFeedEntryStatus,
  type ClientFeedLocalStatus,
} from "../lib/clientFeedLocalStatus";
import type { ClientFeedEntry } from "../services/clientFeedService";

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string): string {
  const d = (iso ?? "").slice(0, 10);
  if (!d) return "—";
  const [, m, day] = d.split("-");
  const months = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split(" ");
  return `${day} ${months[Number(m) - 1] ?? m}`;
}

export interface ClientFeedEntryDetailModalProps {
  visible: boolean;
  entry: ClientFeedEntry | null;
  orgId: string;
  /** Called after any successful action so the parent can refresh the feed + ledger. */
  onActionComplete: () => void;
  onClose: () => void;
}

export function ClientFeedEntryDetailModal({
  visible,
  entry,
  orgId,
  onActionComplete,
  onClose,
}: ClientFeedEntryDetailModalProps) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  if (!entry) return null;

  const candidate = entry.candidate;
  const localAmt = candidate
    ? Number(candidate.amount_in ?? 0) || Number(candidate.amount_out ?? 0)
    : 0;

  const persistLocalStatus = async (status: ClientFeedLocalStatus) => {
    await setClientFeedEntryStatus(orgId, entry.id, status);
  };

  const handleAdd = async () => {
    if (!orgId || busy) return;
    setBusy(true);
    try {
      const { error, row } = await createLedgerEntry(orgId, {
        trip_id: entry.tripId ?? null,
        party_name: entry.clientName,
        description: `Added from client · ${entry.id.slice(0, 12)}`,
        amount_in: entry.amount,
        amount_out: 0,
        transaction_date: entry.transactionDate,
        contact_id: entry.contactId,
        contact_type: "client",
      });
      if (error) {
        Alert.alert("Couldn't add entry", error.message);
        return;
      }
      await persistLocalStatus({
        kind: "ADDED",
        localEntryId: row?.id ?? null,
        at: new Date().toISOString(),
      });
      onActionComplete();
      onClose();
      Alert.alert(
        "Added from client",
        `${formatINR(entry.amount)} has been recorded in your books.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleLink = async () => {
    if (!orgId || !candidate) return;
    await persistLocalStatus({
      kind: "LINKED",
      localEntryId: candidate.id,
      at: new Date().toISOString(),
    });
    onActionComplete();
    onClose();
    Alert.alert(
      "Linked & reconciled",
      "This client entry is now tied to your existing book entry.",
    );
  };

  const handleIgnore = async () => {
    if (!orgId) return;
    Alert.alert(
      "Ignore this entry?",
      "It will be hidden from the feed. You can still find it later under Actioned.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Ignore",
          style: "destructive",
          onPress: async () => {
            await persistLocalStatus({
              kind: "IGNORED",
              at: new Date().toISOString(),
            });
            onActionComplete();
            onClose();
          },
        },
      ],
    );
  };

  const handleAdjustAndAdd = async () => {
    if (!orgId || busy) return;
    // "Adjust & Add" in v1 = create a new local entry that exactly mirrors the client
    // value, so the two books converge. Same path as NEW add, but initiated from the
    // mismatch view so the CTA reads differently.
    await handleAdd();
  };

  const handleRaiseDispute = async () => {
    if (!orgId || !entry.tripId || busy) return;
    Alert.alert(
      "Raise dispute with client?",
      `They logged ${formatINR(entry.amount)} for this trip; your book shows ${formatINR(localAmt)}. Raising a dispute will notify them.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Raise dispute",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              const { error, alreadyInDispute } = await createDispute({
                orgId,
                transaction_id: entry.tripId!,
                partner_org_id: entry.partnerKey,
                internal_snapshot: localAmt,
                partner_snapshot: entry.amount,
                raised_sales: localAmt,
                raised_paid: 0,
              });
              if (error) {
                Alert.alert(
                  alreadyInDispute ? "Already in dispute" : "Error",
                  error.message,
                );
                return;
              }
              await persistLocalStatus({
                kind: "DISPUTED",
                localEntryId: candidate?.id ?? null,
                at: new Date().toISOString(),
              });
              onActionComplete();
              onClose();
              Alert.alert(
                "Dispute raised",
                "The client has been notified. Track status in Compare & Verify.",
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={styles.backdropTouch}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(16, insets.bottom + 8) },
          ]}
        >
          {/* Drag handle */}
          <View style={styles.handle} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 12 }}
          >
            {/* Header */}
            <View style={styles.headerRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.kicker}>FROM CLIENT</Text>
                <Text style={styles.title} numberOfLines={1}>
                  {entry.clientName}
                </Text>
                <View style={styles.metaRow}>
                  <Text style={styles.meta}>
                    {formatDate(entry.transactionDate)}
                  </Text>
                  <View style={styles.dot} />
                  <Text style={styles.meta}>{entry.type}</Text>
                  {entry.tripId ? (
                    <>
                      <View style={styles.dot} />
                      <Text style={styles.meta}>
                        TRIP {entry.tripId.slice(0, 8).toUpperCase()}
                      </Text>
                    </>
                  ) : null}
                </View>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <FontAwesome name="close" size={14} color={Theme.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Amount hero */}
            <View style={styles.amountHero}>
              <Text style={styles.amountValue}>{formatINR(entry.amount)}</Text>
              <Text style={styles.amountHint}>
                Auto-filled from your client's records
              </Text>
            </View>

            {/* State-specific body */}
            {entry.match === "NEW" ? (
              <View style={styles.stateBlock}>
                <Text style={styles.stateTitle}>Not yet in your books</Text>
                <Text style={styles.stateBody}>
                  One tap records this payment in your ledger, tagged{" "}
                  <Text style={styles.stateEmph}>From Client</Text> so the audit
                  trail stays clean.
                </Text>
              </View>
            ) : null}

            {entry.match === "DUPLICATE" && candidate ? (
              <View style={styles.stateBlock}>
                <Text style={styles.stateTitle}>
                  Similar entry found in your books
                </Text>
                <View style={styles.compareRow}>
                  <View style={styles.compareCol}>
                    <Text style={styles.compareLabel}>CLIENT ENTRY</Text>
                    <Text style={styles.compareValue}>
                      {formatINR(entry.amount)}
                    </Text>
                    <Text style={styles.compareMeta}>
                      {formatDate(entry.transactionDate)}
                    </Text>
                  </View>
                  <View style={styles.compareDivider}>
                    <FontAwesome
                      name="link"
                      size={12}
                      color={Theme.driverEmerald}
                    />
                  </View>
                  <View style={styles.compareCol}>
                    <Text style={styles.compareLabel}>YOUR ENTRY</Text>
                    <Text style={styles.compareValue}>
                      {formatINR(localAmt)}
                    </Text>
                    <Text style={styles.compareMeta}>
                      {formatDate(candidate.transaction_date)}
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}

            {entry.match === "MISMATCH" && candidate ? (
              <View style={styles.stateBlock}>
                <Text style={[styles.stateTitle, styles.stateTitleWarn]}>
                  Amounts differ
                </Text>
                <View style={styles.compareRow}>
                  <View style={styles.compareCol}>
                    <Text style={styles.compareLabel}>CLIENT ENTRY</Text>
                    <Text style={styles.compareValue}>
                      {formatINR(entry.amount)}
                    </Text>
                    <Text style={styles.compareMeta}>
                      {formatDate(entry.transactionDate)}
                    </Text>
                  </View>
                  <View
                    style={[styles.compareDivider, styles.compareDividerWarn]}
                  >
                    <FontAwesome
                      name="exclamation"
                      size={11}
                      color={Theme.warning}
                    />
                  </View>
                  <View style={styles.compareCol}>
                    <Text style={styles.compareLabel}>YOUR ENTRY</Text>
                    <Text style={[styles.compareValue, styles.compareValueWarn]}>
                      {formatINR(localAmt)}
                    </Text>
                    <Text style={styles.compareMeta}>
                      {formatDate(candidate.transaction_date)}
                    </Text>
                  </View>
                </View>
                <View style={styles.varianceRow}>
                  <Text style={styles.varianceLabel}>VARIANCE</Text>
                  <Text style={styles.varianceValue}>
                    {formatINR(entry.variance)}
                  </Text>
                </View>
              </View>
            ) : null}

            {entry.match === "ACTIONED" && entry.localStatus ? (
              <View style={styles.stateBlock}>
                <View style={styles.actionedPill}>
                  <FontAwesome
                    name={
                      entry.localStatus.kind === "ADDED"
                        ? "check-circle"
                        : entry.localStatus.kind === "LINKED"
                          ? "link"
                          : entry.localStatus.kind === "DISPUTED"
                            ? "exclamation-circle"
                            : "ban"
                    }
                    size={13}
                    color={
                      entry.localStatus.kind === "DISPUTED"
                        ? Theme.warning
                        : Theme.driverEmerald
                    }
                  />
                  <Text style={styles.actionedText}>
                    {entry.localStatus.kind === "ADDED"
                      ? "Added to your books"
                      : entry.localStatus.kind === "LINKED"
                        ? "Linked & reconciled"
                        : entry.localStatus.kind === "DISPUTED"
                          ? "Dispute raised"
                          : "Ignored"}
                  </Text>
                </View>
              </View>
            ) : null}
          </ScrollView>

          {/* Sticky action bar */}
          <View style={styles.actionBar}>
            {entry.match === "NEW" ? (
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={busy}
                onPress={handleAdd}
                style={[
                  styles.ctaPrimary,
                  busy && styles.ctaDisabled,
                ]}
              >
                {busy ? (
                  <LoadingIndicator color={Theme.textOnDark} />
                ) : (
                  <>
                    <FontAwesome name="plus" size={12} color={Theme.textOnDark} />
                    <Text style={styles.ctaPrimaryText}>ADD TO MY BOOKS</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}

            {entry.match === "DUPLICATE" ? (
              <View style={styles.actionStack}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={busy}
                  onPress={handleLink}
                  style={[styles.ctaPrimary, busy && styles.ctaDisabled]}
                >
                  <FontAwesome name="link" size={12} color={Theme.textOnDark} />
                  <Text style={styles.ctaPrimaryText}>
                    LINK & MARK RECONCILED
                  </Text>
                </TouchableOpacity>
                <View style={styles.secondaryRow}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={handleIgnore}
                    style={styles.ctaSecondary}
                  >
                    <Text style={styles.ctaSecondaryText}>IGNORE</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {entry.match === "MISMATCH" ? (
              <View style={styles.actionStack}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={busy}
                  onPress={handleAdjustAndAdd}
                  style={[styles.ctaPrimary, busy && styles.ctaDisabled]}
                >
                  <FontAwesome name="pencil" size={12} color={Theme.textOnDark} />
                  <Text style={styles.ctaPrimaryText}>ADJUST & ADD</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={busy}
                  onPress={handleRaiseDispute}
                  style={[styles.ctaDanger, busy && styles.ctaDisabled]}
                >
                  <FontAwesome
                    name="exclamation"
                    size={12}
                    color={Theme.warning}
                  />
                  <Text style={styles.ctaDangerText}>RAISE DISPUTE</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {entry.match === "ACTIONED" ? (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={onClose}
                style={styles.ctaSecondary}
              >
                <Text style={styles.ctaSecondaryText}>DONE</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "flex-end",
  },
  backdropTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: "88%",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.12,
        shadowRadius: 18,
      },
      android: { elevation: 8 },
    }),
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.borderLight,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  kicker: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  title: {
    fontSize: 19,
    fontWeight: "800",
    color: Theme.textPrimary,
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  meta: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Theme.textMuted,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  amountHero: {
    backgroundColor: Theme.textPrimaryDark,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 22,
    alignItems: "center",
    marginBottom: 16,
  },
  amountValue: {
    fontSize: 36,
    fontWeight: "900",
    color: Theme.textOnDark,
    letterSpacing: -1,
  },
  amountHint: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  stateBlock: {
    marginBottom: 14,
  },
  stateTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimary,
    marginBottom: 6,
  },
  stateTitleWarn: {
    color: Theme.warning,
  },
  stateBody: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 18,
  },
  stateEmph: {
    color: Theme.textPrimary,
    fontWeight: "800",
  },
  compareRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    marginTop: 10,
  },
  compareCol: {
    flex: 1,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minWidth: 0,
  },
  compareLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  compareValue: {
    fontSize: 18,
    fontWeight: "900",
    color: Theme.textPrimary,
    marginTop: 6,
    letterSpacing: -0.3,
  },
  compareValueWarn: {
    color: Theme.warning,
  },
  compareMeta: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  compareDivider: {
    alignSelf: "center",
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(16,185,129,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  compareDividerWarn: {
    backgroundColor: "rgba(180,83,9,0.14)",
  },
  varianceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(180,83,9,0.08)",
    borderWidth: 1,
    borderColor: "rgba(180,83,9,0.18)",
  },
  varianceLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    color: Theme.warning,
  },
  varianceValue: {
    fontSize: 14,
    fontWeight: "900",
    color: Theme.warning,
  },
  actionedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    backgroundColor: "rgba(16,185,129,0.1)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionedText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.driverEmerald,
    letterSpacing: 0.4,
  },
  actionBar: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    gap: 10,
  },
  actionStack: {
    gap: 10,
  },
  secondaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  ctaPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Theme.textPrimaryDark,
    paddingVertical: 16,
    borderRadius: 16,
  },
  ctaPrimaryText: {
    fontSize: 12,
    fontWeight: "900",
    color: Theme.textOnDark,
    letterSpacing: 1.4,
  },
  ctaSecondary: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
  },
  ctaSecondaryText: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.textPrimary,
    letterSpacing: 1.2,
  },
  ctaDanger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 16,
    paddingVertical: 15,
    backgroundColor: "rgba(180,83,9,0.1)",
    borderWidth: 1,
    borderColor: "rgba(180,83,9,0.28)",
  },
  ctaDangerText: {
    fontSize: 12,
    fontWeight: "900",
    color: Theme.warning,
    letterSpacing: 1.4,
  },
  ctaDisabled: {
    opacity: 0.5,
  },
});
