/**
 * Wide sales tables: desktop keeps CSS overflow-x; compact uses a nested
 * horizontal ScrollView so native and narrow web do not clip columns.
 */
import {
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import { profileHubLayoutStyles as mobile } from "@/features/party/components/profileHubLayout.styles";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";

type Props = {
  compact: boolean;
  children: ReactNode;
};

export function NetworkDesktopSalesTableOverflow({ compact, children }: Props) {
  if (!compact) {
    return <View style={styles.salesTableScroll}>{children}</View>;
  }
  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator
      style={mobile.tableScroll}
      contentContainerStyle={mobile.tableScrollInner}
    >
      {children}
    </ScrollView>
  );
}
