import { StyleSheet } from "react-native";

import Theme from "@/constants/Theme";
import { layout } from "@/design-system/layout";
import { space } from "@/design-system/spacing";

export const operationsEntryStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: space[2],
    gap: space[2],
  },
  row2: {
    flexDirection: "row",
    gap: space[2],
    alignItems: "stretch",
  },
  row2Cell: {
    flex: 1,
    minWidth: 0,
  },
  metaHint: {
    fontSize: 9,
    color: Theme.textSecondary,
    lineHeight: 13,
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 8,
    paddingHorizontal: space[2],
    paddingVertical: 8,
    color: Theme.text,
    backgroundColor: Theme.whiteMuted,
    fontSize: 12,
    minHeight: 36,
  },
  notes: {
    minHeight: 56,
    textAlignVertical: "top",
    paddingTop: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
    marginVertical: space[1],
  },
  hint: {
    color: "#b45309",
    fontSize: 10,
    lineHeight: 14,
    paddingHorizontal: 2,
  },
  footer: {
    flexDirection: "row",
    gap: space[2],
    alignItems: "stretch",
  },
  footerBtn: {
    flex: 1,
    minWidth: 0,
  },
  routeLine: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
    marginBottom: 2,
  },
});
