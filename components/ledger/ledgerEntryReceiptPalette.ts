import Theme from "@/constants/Theme";
import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";

/** Shared palette for ledger entry receipt / preview cards (mobile + desktop). */
export const LEDGER_RECEIPT = {
  cardBg: Theme.cardWhite,
  overlay: Theme.overlayBackdrop,
  detailBg: METRONIC.bodyBg,
  border: METRONIC.border,
  label: METRONIC.muted,
  value: METRONIC.text,
  subtle: METRONIC.subtle,
  title: METRONIC.text,
  amountIn: Theme.primary,
  amountOut: Theme.negative,
  statusBg: "#F1F5F9",
  statusBorder: "#CBD5E1",
  statusText: METRONIC.muted,
  primaryBtn: Theme.primary,
  primaryBtnText: Theme.textOnPrimary,
  shadow: Theme.shadow,
} as const;
