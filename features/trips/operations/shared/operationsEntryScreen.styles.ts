import { StyleSheet } from "react-native";

import Theme from "@/constants/Theme";
import { layout } from "@/design-system/layout";
import { space } from "@/design-system/spacing";

export const operationsEntryStyles = StyleSheet.create({
  screen: {
    flex: 1,
    minHeight: 0,
    backgroundColor: Theme.screenBackground,
  },
  scroll: {
    flex: 1,
    // RN Web: without minHeight 0, ScrollView grows with content and
    // pushes the sticky footer below the overflow:hidden root clip.
    minHeight: 0,
  },
  content: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: space[1],
    gap: 6,
  },
  card: {
    gap: 6,
  },
  row2: {
    flexDirection: "row",
    gap: 6,
    alignItems: "stretch",
  },
  row2Cell: {
    flex: 1,
    minWidth: 0,
  },
  metaHint: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 11,
    marginTop: 4,
  },
  fieldLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  input: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    color: Theme.text,
    backgroundColor: Theme.whiteMuted,
    fontSize: 11,
    minHeight: 32,
    lineHeight: 14,
  },
  notes: {
    minHeight: 44,
    textAlignVertical: "top",
    paddingTop: 6,
  },
  fieldStack: {
    gap: 6,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
    marginVertical: 4,
  },
  hint: {
    color: "#b45309",
    fontSize: 9,
    lineHeight: 12,
    paddingHorizontal: 2,
  },
  footer: {
    flexDirection: "row",
    gap: 6,
    alignItems: "stretch",
  },
  footerBtn: {
    flex: 1,
    minWidth: 0,
  },
  photoWrap: {
    marginTop: 0,
  },
});
