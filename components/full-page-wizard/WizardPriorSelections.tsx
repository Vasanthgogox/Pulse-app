import { memo, useMemo } from "react";
import { View } from "react-native";

import { WizardEntitySummaryCard } from "@/components/full-page-wizard/WizardEntityPicker";
import { fullPageWizardStyles } from "@/components/full-page-wizard/fullPageWizardStyles";
import type { PartyEntityType } from "@/components/PartyAvatar";
import { WizardPartyContextRow } from "@/components/full-page-wizard/WizardPartyContextRow";

export type WizardPriorSelectionItem = {
  id: string;
  label: string;
  name: string;
  subtitle?: string | null;
  entityType?: PartyEntityType;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  onPress?: () => void;
};

export type WizardPriorSelectionsProps = {
  items: readonly WizardPriorSelectionItem[];
  /** When both ids are present, render as a horizontal context row (Driver · Shipper). */
  contextPairIds?: readonly [string, string];
};

function toPartyCell(item: WizardPriorSelectionItem) {
  return {
    label: item.label,
    name: item.name,
    subtitle: item.subtitle,
    entityType: item.entityType ?? ("client" as const),
    avatarUrl: item.avatarUrl,
    avatarSeed: item.avatarSeed,
    organizationImageUrl: item.organizationImageUrl,
    organizationAvatarSeed: item.organizationAvatarSeed,
    onPress: item.onPress,
  };
}

/** Prior wizard choices — pairs context entities in one row, stacks the rest. */
export const WizardPriorSelections = memo(function WizardPriorSelections({
  items,
  contextPairIds,
}: WizardPriorSelectionsProps) {
  const { contextRow, rest } = useMemo(() => {
    if (!contextPairIds || contextPairIds.length !== 2) {
      return { contextRow: null, rest: items };
    }
    const [leftId, rightId] = contextPairIds;
    const left = items.find((i) => i.id === leftId);
    const right = items.find((i) => i.id === rightId);
    if (!left || !right) {
      return { contextRow: null, rest: items };
    }
    const paired = new Set([leftId, rightId]);
    return {
      contextRow: { left, right },
      rest: items.filter((i) => !paired.has(i.id)),
    };
  }, [items, contextPairIds]);

  if (!items.length) return null;

  return (
    <View style={fullPageWizardStyles.wizardPriorSelectionsStack}>
      {contextRow ? (
        <WizardPartyContextRow
          left={toPartyCell(contextRow.left)}
          right={toPartyCell(contextRow.right)}
        />
      ) : null}
      {rest.map((item) => (
        <WizardEntitySummaryCard
          key={item.id}
          label={item.label}
          name={item.name}
          subtitle={item.subtitle}
          entityType={item.entityType ?? "client"}
          avatarUrl={item.avatarUrl}
          avatarSeed={item.avatarSeed}
          organizationImageUrl={item.organizationImageUrl}
          organizationAvatarSeed={item.organizationAvatarSeed}
          onPress={item.onPress}
        />
      ))}
    </View>
  );
});
