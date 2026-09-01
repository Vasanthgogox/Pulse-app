/**
 * IndentShareTicketModal — confirm-share dialog styled as a box-office
 * ticket. Replaces the generic ThemedConfirmModal for the
 * "Share to network?" and "Save draft?" flows in
 * `app/create-indent/index.tsx`.
 *
 * Visual language
 * ───────────────
 * The card is split into two zones — a top portion carrying the
 * indent summary and a bottom stub carrying the read-only disclaimer
 * and action row. The two zones are separated by a perforated dashed
 * line with two half-circle notches sunk into the card edges,
 * mimicking the tear-here line on a real box-office stub.
 *
 * Typography reuses `FinanceTxnTypography` so the ticket reads as a
 * peer of the transaction list / finance kanban cards:
 *   • Brand kicker          → `partyTitle`  (italic UPPERCASE)
 *   • Field labels          → `fieldLabel`  (UPPERCASE letter-spaced)
 *   • Field values          → `fieldValue`  (italic, dark)
 *   • Trip date / load ref  → `tripId`      (italic UPPERCASE primary)
 *
 * Theme palette: `Theme.primary` (Pulse purple) keys the brand
 * header and accents; `Theme.buttonMatteBlack` is the primary
 * action. Side notches use a solid stand-in for the dimmed overlay
 * so the punch reads as a real cut-out (not a translucent blob).
 */
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import { Ticket } from "lucide-react-native";
import React, { useMemo } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface IndentShareTicketFields {
  pickup: string;
  drop: string;
  client: string;
  tripDate: string;
  tons: string;
  vehicle: string;
  loadType: string;
  clientPrice: string;
  supplierTarget: string;
  /** How many matching indents will be created (shown when > 1). */
  vehicleCount?: string;
}

export interface IndentShareTicketModalProps {
  visible: boolean;
  fields: IndentShareTicketFields;
  /** Optional short reference / draft id printed on the ticket header. */
  ticketRef?: string | null;
  title?: string;
  headerCaption?: string;
  headerKicker?: string;
  stubFinePrint?: string;
  cancelText?: string;
  confirmText?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

const NOTCH_SIZE = 14;
/**
 * Solid stand-in for `Theme.overlayBackdrop` (`rgba(0,0,0,0.4)`) over a
 * light screen. Translucent notches double-darken on the overlay and wash
 * out on the ticket — a solid fill + overflow clip reads as a real punch.
 */
const TICKET_NOTCH_FILL = "#949494";

function formatCurrencyDisplay(raw: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || trimmed === "—") return "—";
  // Strip existing currency symbols / commas, then format as INR.
  const numericString = trimmed.replace(/[^\d.-]/g, "");
  const value = Number(numericString);
  if (!Number.isFinite(value) || value === 0) return trimmed;
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `₹${trimmed}`;
  }
}

function formatTripDateDisplay(iso: string): string {
  const trimmed = (iso ?? "").trim();
  if (!trimmed || trimmed === "—") return "—";
  try {
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return trimmed;
    return d
      .toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      .toUpperCase();
  } catch {
    return trimmed;
  }
}

/** Two-line route block; if either end is missing falls back to "—". */
function TicketRouteRow({ pickup, drop }: { pickup: string; drop: string }) {
  return (
    <View style={styles.routeRow}>
      <View style={styles.routeCol}>
        <Text style={styles.fieldLabel}>PICKUP</Text>
        <Text style={styles.fieldValue} numberOfLines={2}>
          {pickup || "—"}
        </Text>
      </View>
      <View style={styles.routeDividerWrap}>
        <View style={styles.routeDividerLine} />
        <View style={styles.routeArrow}>
          <Text style={styles.routeArrowText}>→</Text>
        </View>
      </View>
      <View style={[styles.routeCol, styles.routeColRight]}>
        <Text style={[styles.fieldLabel, styles.fieldLabelRight]}>DROP</Text>
        <Text
          style={[styles.fieldValue, styles.fieldValueRight]}
          numberOfLines={2}
        >
          {drop || "—"}
        </Text>
      </View>
    </View>
  );
}

function TicketStatRow({
  label,
  value,
  align = "left",
}: {
  label: string;
  value: string;
  align?: "left" | "right";
}) {
  return (
    <View style={[styles.statCell, align === "right" && styles.statCellRight]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text
        style={[
          styles.fieldValue,
          align === "right" && styles.fieldValueRight,
        ]}
        numberOfLines={1}
      >
        {value || "—"}
      </Text>
    </View>
  );
}

export function IndentShareTicketModal({
  visible,
  fields,
  ticketRef,
  title = "Share to network?",
  headerCaption = "One-way trip ticket",
  headerKicker = "PULSE NETWORK · INDENT",
  stubFinePrint = "Once shared, this indent becomes read-only and cannot be edited.",
  cancelText = "Cancel",
  confirmText = "Share now",
  onCancel,
  onConfirm,
}: IndentShareTicketModalProps) {
  const insets = useSafeAreaInsets();

  const tripDateDisplay = useMemo(
    () => formatTripDateDisplay(fields.tripDate),
    [fields.tripDate],
  );
  const clientPriceDisplay = useMemo(
    () => formatCurrencyDisplay(fields.clientPrice),
    [fields.clientPrice],
  );
  const supplierTargetDisplay = useMemo(
    () => formatCurrencyDisplay(fields.supplierTarget),
    [fields.supplierTarget],
  );

  /** Stable-ish short reference printed in the header; falls back to
   *  a date-derived stub if no draft id is passed. */
  const headerCode = useMemo(() => {
    if (ticketRef && ticketRef.trim().length > 0) {
      const t = ticketRef.trim().toUpperCase();
      return `#${t.length > 8 ? t.slice(-8) : t}`;
    }
    const d = new Date();
    return `#${d.getFullYear().toString().slice(-2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  }, [ticketRef]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View
        style={[
          styles.overlay,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <View style={styles.ticket}>
          {/* ── Brand header band (Pulse purple) ───────────────────── */}
          <View style={styles.headerBand}>
            <View style={styles.headerIconWrap}>
              <Ticket size={14} color={Theme.primary} strokeWidth={2.2} />
            </View>
            <View style={styles.headerTextCol}>
              <Text style={styles.headerKicker} numberOfLines={1}>
                {headerKicker}
              </Text>
              <Text style={styles.headerCaption} numberOfLines={1}>
                {headerCaption}
              </Text>
            </View>
            <Text style={styles.headerCode} numberOfLines={1}>
              {headerCode}
            </Text>
          </View>

          {/* ── Body (top portion) ─────────────────────────────────── */}
          <View style={styles.body}>
            <Text style={styles.title}>{title}</Text>

            <TicketRouteRow pickup={fields.pickup} drop={fields.drop} />

            <View style={styles.divider} />

            {/* Client + Trip date row */}
            <View style={styles.statRow}>
              <TicketStatRow label="CLIENT" value={fields.client} />
              <TicketStatRow
                label="TRIP DATE"
                value={tripDateDisplay}
                align="right"
              />
            </View>

            {/* Load row */}
            <View style={styles.statRow}>
              <TicketStatRow label="LOAD TYPE" value={fields.loadType} />
              <TicketStatRow
                label="TONS"
                value={fields.tons}
                align="right"
              />
            </View>

            {/* Vehicle + count */}
            <View style={styles.statRow}>
              <TicketStatRow label="VEHICLE" value={fields.vehicle} />
              <TicketStatRow
                label="VEHICLES"
                value={fields.vehicleCount?.trim() || "1"}
                align="right"
              />
            </View>

            {/* Commercials pill block */}
            <View style={styles.commercialsRow}>
              <View style={styles.commercialCell}>
                <Text style={styles.commercialLabel}>CLIENT PRICE</Text>
                <Text style={styles.commercialAmount} numberOfLines={1}>
                  {clientPriceDisplay}
                </Text>
              </View>
              <View style={styles.commercialDivider} />
              <View
                style={[styles.commercialCell, styles.commercialCellRight]}
              >
                <Text
                  style={[
                    styles.commercialLabel,
                    styles.commercialLabelRight,
                  ]}
                >
                  SUPPLIER TARGET
                </Text>
                <Text
                  style={[
                    styles.commercialAmount,
                    styles.commercialAmountRight,
                  ]}
                  numberOfLines={1}
                >
                  {supplierTargetDisplay}
                </Text>
              </View>
            </View>
          </View>

          {/* ── Perforation (tear here) ────────────────────────────── */}
          <View style={styles.perforation} pointerEvents="none">
            <View style={[styles.notch, styles.notchLeft]} />
            <View style={styles.dashLine} />
            <View style={[styles.notch, styles.notchRight]} />
          </View>

          {/* ── Stub (bottom portion) ──────────────────────────────── */}
          <View style={styles.stub}>
            <Text style={styles.stubFinePrint}>{stubFinePrint}</Text>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                onPress={onCancel}
                style={[styles.button, styles.buttonSecondary]}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Text style={styles.buttonTextSecondary}>{cancelText}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onConfirm}
                style={[styles.button, styles.buttonPrimary]}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Text style={styles.buttonTextPrimary}>{confirmText}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  /**
   * Ticket card. `overflow: hidden` clips the outer half of each notch so
   * only a semicircle bite remains — the classic token punch. Rounded
   * corners live on the inner zones (`headerBand`, `stub`).
   */
  ticket: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
    overflow: "hidden",
    position: "relative",
  },
  /** Purple brand band — capped with the same `borderRadius` as the
   *  card on the top so it sits flush at the top edge. */
  headerBand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Theme.buttonPrimary,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  headerIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  /** Brand kicker — italic UPPERCASE letter-spaced, mirrors
   *  `FinanceTxnTypography.partyTitle` so the ticket reads as a
   *  proper transaction-system citizen. */
  headerKicker: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 11,
    color: "#ffffff",
    letterSpacing: 0.6,
  },
  headerCaption: {
    fontSize: 9,
    fontWeight: "400",
    color: "rgba(255,255,255,0.78)",
    marginTop: 2,
    letterSpacing: 0.2,
  },
  headerCode: {
    ...FinanceTxnTypography.tripId,
    color: "#ffffff",
    fontSize: 10,
    letterSpacing: 0.8,
    flexShrink: 0,
  },
  body: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  routeCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  routeColRight: {
    alignItems: "flex-end",
  },
  routeDividerWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 14,
    minWidth: 22,
    position: "relative",
  },
  routeDividerLine: {
    position: "absolute",
    top: 20,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
  },
  routeArrow: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#ffffff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  routeArrowText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.primary,
    lineHeight: 14,
  },
  /** Field label = FinanceTxnTypography.fieldLabel (9 px UPPERCASE). */
  fieldLabel: {
    ...FinanceTxnTypography.fieldLabel,
  },
  fieldLabelRight: {
    textAlign: "right",
  },
  /** Field value = FinanceTxnTypography.fieldValue (9 px italic dark). */
  fieldValue: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 12,
    lineHeight: 16,
    fontStyle: "normal",
    fontWeight: "500",
  },
  fieldValueRight: {
    textAlign: "right",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
    marginVertical: 2,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  statCell: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  statCellRight: {
    alignItems: "flex-end",
  },
  statRowFull: {
    gap: 3,
  },
  commercialsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: 4,
    backgroundColor: "rgba(79, 70, 229, 0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(79, 70, 229, 0.18)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  commercialCell: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  commercialCellRight: {
    alignItems: "flex-end",
  },
  commercialDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: "rgba(79, 70, 229, 0.22)",
    marginHorizontal: 10,
  },
  commercialLabel: {
    ...FinanceTxnTypography.fieldLabel,
    color: Theme.primary,
  },
  commercialLabelRight: {
    textAlign: "right",
  },
  commercialAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  commercialAmountRight: {
    textAlign: "right",
  },
  /** Perforation strip — semicircle punches at the edges + dashed tear line. */
  perforation: {
    flexDirection: "row",
    alignItems: "center",
    height: NOTCH_SIZE,
    marginVertical: 0,
  },
  notch: {
    width: NOTCH_SIZE,
    height: NOTCH_SIZE,
    borderRadius: NOTCH_SIZE / 2,
    backgroundColor: TICKET_NOTCH_FILL,
    flexShrink: 0,
  },
  /** Center of the circle sits on the card edge; outer half is clipped. */
  notchLeft: {
    marginLeft: -(NOTCH_SIZE / 2),
  },
  notchRight: {
    marginRight: -(NOTCH_SIZE / 2),
  },
  dashLine: {
    flex: 1,
    height: 0,
    marginHorizontal: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    borderColor: Theme.borderInput,
  },
  stub: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 14,
    backgroundColor: "#FAFAFB",
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  /** Disclaimer styled like a "fine print" line — italic muted. */
  stubFinePrint: {
    ...FinanceTxnTypography.routeWhy,
    fontSize: 10,
    lineHeight: 14,
    textAlign: "center",
    color: Theme.textSecondary,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  button: {
    flex: 1,
    minHeight: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonSecondary: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  buttonPrimary: {
    backgroundColor: Theme.buttonMatteBlack,
  },
  buttonTextSecondary: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
  buttonTextPrimary: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.buttonMatteBlackText,
    letterSpacing: 0.2,
  },
});
