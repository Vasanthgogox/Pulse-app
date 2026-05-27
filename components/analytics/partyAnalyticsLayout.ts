/**
 * Shared layout for party-detail analytics tabs (client, supplier, driver, vehicle).
 * Cancels parent scroll padding so analytics align edge-to-edge like Cash Flow.
 */
import { StyleSheet } from "react-native";

import Layout from "@/constants/Layout";

export const partyAnalyticsLayout = StyleSheet.create({
  inset: {
    marginHorizontal: -Layout.screenPaddingHorizontal,
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
});
