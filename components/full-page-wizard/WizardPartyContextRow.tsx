import { memo } from "react";
import { useWindowDimensions } from "react-native";

import {
  FullPageWizardPartyRow,
  type FullPageWizardPartyRowProps,
} from "./FullPageWizardPartyCard";
import {
  WizardEntityPartyCell,
  type WizardEntityPartyCellProps,
} from "./WizardEntityPartyCell";

export type WizardPartyContextRowProps = {
  left: WizardEntityPartyCellProps;
  right?: WizardEntityPartyCellProps | null;
  /** Stack vertically only on very narrow viewports (default 300). */
  stackBelowWidth?: number;
  style?: FullPageWizardPartyRowProps["style"];
  /** Dense summary chips (driver name / load steps). */
  compact?: boolean;
};

/**
 * Attribution-style context row: Driver + Shipper (or Client + Partner) side by side.
 */
export const WizardPartyContextRow = memo(function WizardPartyContextRow({
  left,
  right,
  stackBelowWidth = 300,
  style,
  compact = false,
}: WizardPartyContextRowProps) {
  const { width } = useWindowDimensions();

  if (!right) {
    return <WizardEntityPartyCell {...left} compact={compact} solo />;
  }

  return (
    <FullPageWizardPartyRow
      /** Never stack compact chips — keep one tiny summary row. */
      stack={!compact && width < stackBelowWidth}
      style={style}
    >
      <WizardEntityPartyCell {...left} compact={compact} />
      <WizardEntityPartyCell {...right} compact={compact} />
    </FullPageWizardPartyRow>
  );
});
