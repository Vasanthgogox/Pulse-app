import { AlertRegistrySignalCard } from "@/components/AlertRegistrySignalCard";
import Layout from "@/constants/Layout";
import type { SalaryRequestWithDriverRow } from "@/features/drivers/services/salaryRequests.service";
import type { AlertDetailMode } from "@/lib/alertRegistry/alertDetailRoute.util";
import {
  buildOpsAlertCardPresentation,
  buildSalaryAlertCardPresentation,
} from "@/lib/alertRegistry/alertDetailPresentation.util";
import type { RegistryPartyLookup } from "@/lib/alertRegistry/registryOpsPresentation.util";
import type { GlobalOperationAlert } from "@/lib/globalSync/priorityEngine.util";
import type { RegistryFeedKind } from "@/lib/globalSync/registryFeed.util";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import { StyleSheet, View } from "react-native";

export type AlertDetailChatBodyProps = {
  kind: RegistryFeedKind;
  mode: AlertDetailMode;
  salary: SalaryRequestWithDriverRow | null;
  ops: GlobalOperationAlert | null;
  driversById: Map<string, DriverRow>;
  partyCtx: RegistryPartyLookup;
};

export function AlertDetailChatBody({
  kind,
  mode,
  salary,
  ops,
  driversById,
  partyCtx,
}: AlertDetailChatBodyProps) {
  const presentation =
    kind === "salary" && salary
      ? buildSalaryAlertCardPresentation(salary, driversById, mode)
      : kind === "ops" && ops
        ? buildOpsAlertCardPresentation(ops, partyCtx, mode)
        : null;

  if (!presentation) return null;

  return (
    <View style={styles.wrap}>
      <AlertRegistrySignalCard {...presentation} variant="feed" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 8,
  },
});
