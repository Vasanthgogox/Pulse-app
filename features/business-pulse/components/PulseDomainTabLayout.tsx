import { memo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { PulseOverviewDesktopLayout } from "@/features/business-pulse/components/PulseWidgetBoard";
import {
  PULSE_PAGE_BG,
  pulseEnterpriseStyles as ent,
} from "@/features/business-pulse/components/pulseEnterpriseStyles";

type Props = {
  kpis?: ReactNode;
  left: ReactNode;
  main: ReactNode;
  isDesktop: boolean;
};

/** Metronic-style domain tab — optional KPI strip + left rail + main column. */
export const PulseDomainTabLayout = memo(function PulseDomainTabLayout({
  kpis,
  left,
  main,
  isDesktop,
}: Props) {
  return (
    <View style={styles.section}>
      {kpis ? <View style={styles.kpiWrap}>{kpis}</View> : null}
      {isDesktop ? (
        <PulseOverviewDesktopLayout left={left} main={main} />
      ) : (
        <View style={styles.mobileStack}>
          {left}
          {main}
        </View>
      )}
    </View>
  );
});

export function PulseDomainKpiStrip({ children }: { children: ReactNode }) {
  return <View style={styles.kpiStrip}>{children}</View>;
}

const styles = StyleSheet.create({
  section: {
    gap: 12,
    width: "100%",
  },
  kpiWrap: {
    width: "100%",
  },
  kpiStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    width: "100%",
  },
  mobileStack: {
    gap: 12,
    width: "100%",
  },
});

export { PULSE_PAGE_BG, ent };
