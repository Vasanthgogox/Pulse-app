/**
 * Lazy gate for the web party-registration portal (~2.8k lines).
 */
import { lazy, Suspense } from "react";
import type { PartyRegistrationPortalProps } from "./PartyRegistrationPortal";

export type {
  PartyRegistrationKind,
  PartyRegistrationPortalProps,
} from "./PartyRegistrationPortal";

const PartyRegistrationPortal = lazy(() =>
  import("./PartyRegistrationPortal").then((m) => ({
    default: m.PartyRegistrationPortal,
  })),
);

type Props = PartyRegistrationPortalProps & {
  active: boolean;
};

export function FinancePartyRegistrationPortal({ active, ...props }: Props) {
  if (!active) return null;
  return (
    <Suspense fallback={null}>
      <PartyRegistrationPortal {...props} />
    </Suspense>
  );
}
