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
};

/**
 * Attribution-style context row: Driver + Shipper (or Client + Partner) side by side.
 */
export const WizardPartyContextRow = memo(function WizardPartyContextRow({
  left,
  right,
  stackBelowWidth = 300,
  style,
}: WizardPartyContextRowProps) {
  const { width } = useWindowDimensions();

  if (!right) {
    return <WizardEntityPartyCell {...left} />;
  }

  return (
    <FullPageWizardPartyRow stack={width < stackBelowWidth} style={style}>
      <WizardEntityPartyCell {...left} />
      <WizardEntityPartyCell {...right} />
    </FullPageWizardPartyRow>
  );
});
