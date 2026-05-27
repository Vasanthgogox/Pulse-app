import { memo, useMemo, type ReactNode } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import Theme from "@/constants/Theme";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";

const NOTCH_SIZE = 16;
const DASH_COUNT = 24;

export interface LedgerTicketChromeProps {
  headerKicker: string;
  headerCaption?: string;
  headerCode?: string;
  headerColor?: string;
  children: ReactNode;
  stub?: ReactNode;
  backgroundColor?: string;
  /** Screen backdrop behind ticket — used for perforation notch cut-outs. */
  notchBackdrop?: string;
}

export const LedgerTicketChrome = memo(function LedgerTicketChrome({
  headerKicker,
  headerCaption,
  headerCode,
  headerColor = Theme.primary,
  children,
  stub,
  backgroundColor = Theme.cardWhite,
  notchBackdrop = "#ffffff",
}: LedgerTicketChromeProps) {
  const dashes = useMemo(() => "—".repeat(DASH_COUNT), []);

  return (
    <View style={[styles.ticket, { backgroundColor }]}>
      <View style={[styles.headerBand, { backgroundColor: headerColor }]}>
        <View style={styles.headerTextCol}>
          <Text style={styles.headerKicker} numberOfLines={1}>
            {headerKicker}
          </Text>
          {headerCaption ? (
            <Text style={styles.headerCaption} numberOfLines={1}>
              {headerCaption}
            </Text>
          ) : null}
        </View>
        {headerCode ? (
          <Text style={styles.headerCode} numberOfLines={1}>
            {headerCode}
          </Text>
        ) : null}
      </View>

      <View style={styles.body}>{children}</View>

      {stub ? (
        <>
          <View style={styles.perforation} pointerEvents="none">
            <View style={[styles.notch, styles.notchLeft, { backgroundColor: notchBackdrop }]} />
            <Text style={styles.perforationDashes} numberOfLines={1} ellipsizeMode="clip">
              {dashes}
            </Text>
            <View style={[styles.notch, styles.notchRight, { backgroundColor: notchBackdrop }]} />
          </View>
          <View style={styles.stub}>{stub}</View>
        </>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  ticket: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: Platform.OS === "web" ? "visible" : "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 14,
      },
      android: { elevation: 4 },
      web: { boxShadow: "0 8px 24px rgba(15,23,42,0.08)" } as object,
    }),
  },
  headerBand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  headerTextCol: { flex: 1, minWidth: 0 },
  headerKicker: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 10,
    color: "#fff",
    letterSpacing: 0.8,
  },
  headerCaption: {
    fontSize: 9,
    fontWeight: "500",
    color: "rgba(255,255,255,0.82)",
    marginTop: 2,
  },
  headerCode: {
    ...FinanceTxnTypography.tripId,
    color: "#fff",
    fontSize: 10,
    flexShrink: 0,
  },
  body: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  perforation: {
    flexDirection: "row",
    alignItems: "center",
    height: NOTCH_SIZE,
    position: "relative",
  },
  notch: {
    width: NOTCH_SIZE,
    height: NOTCH_SIZE,
    borderRadius: NOTCH_SIZE / 2,
    backgroundColor: "#f1f5f9",
    position: "absolute",
    top: 0,
  },
  notchLeft: { left: -(NOTCH_SIZE / 2) },
  notchRight: { right: -(NOTCH_SIZE / 2) },
  perforationDashes: {
    flex: 1,
    textAlign: "center",
    fontSize: 9,
    letterSpacing: 1,
    color: Theme.textMuted,
    marginHorizontal: NOTCH_SIZE / 2,
  },
  stub: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    paddingTop: 4,
    gap: 8,
  },
});
