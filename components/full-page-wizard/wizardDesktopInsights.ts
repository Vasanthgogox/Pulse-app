import type { WizardInsightCard } from "./WizardInsightRail";
import Illustration20 from "@/assets/illustrations/20.svg";
import Illustration28 from "@/assets/illustrations/28.svg";
import Illustration11 from "@/assets/illustrations/11.svg";
import Illustration6 from "@/assets/illustrations/6.svg";
import Illustration31 from "@/assets/illustrations/31.svg";
import Illustration2 from "@/assets/illustrations/2.svg";
import FeedbackIllustration from "@/assets/illustrations/customer-giving-feedback-for-delivery-service.svg";
import IconVector from "@/assets/file type icons/vector.svg";
import IconRecord from "@/assets/file type icons/record.svg";
import IconText from "@/assets/file type icons/text.svg";
import IconDisc from "@/assets/file type icons/disc.svg";

export type WizardInsightPreset = "trip" | "load" | "attribution" | "allocation";

const LEFT_TRIP: WizardInsightCard[] = [
  {
    id: "live-tracking",
    eyebrow: "Operations",
    title: "Live trip tracking",
    body: "Share driver location with clients and cut status calls during in-transit trips.",
    accent: "indigo",
    illustration: Illustration20,
    icon: IconRecord,
  },
  {
    id: "network",
    eyebrow: "Network",
    title: "Find return loads",
    body: "Browse Load Center to match empty legs with partner indents in your lane.",
    accent: "green",
    illustration: Illustration28,
    icon: IconVector,
  },
  {
    id: "integrated-network-trip",
    eyebrow: "Integrated trip",
    title: "Run partner trips in one workspace",
    body: "Create network-integrated trips and keep client, supplier, and dispatch updates in a single shared flow.",
    accent: "indigo",
    illustration: Illustration31,
    icon: IconText,
  },
  {
    id: "trip-chat-updates",
    eyebrow: "Trip chat",
    title: "Share updates without switching apps",
    body: "Use Trip Chat to send status notes, proofs, and handoff updates with a complete message trail.",
    accent: "green",
    illustration: Illustration2,
    icon: IconRecord,
  },
  {
    id: "tracking-confidence",
    eyebrow: "Driver tracking",
    title: "Track movement with confidence",
    body: "Live location pings and ETA visibility help teams reduce follow-up calls and resolve delays faster.",
    accent: "amber",
    illustration: FeedbackIllustration,
    icon: IconDisc,
  },
  {
    id: "eta-visibility",
    eyebrow: "Visibility",
    title: "Set clearer ETA expectations",
    body: "Accurate route inputs improve ETA quality so clients and partners can plan unload and follow-up tasks better.",
    accent: "indigo",
    illustration: Illustration11,
    icon: IconText,
  },
];

const LEFT_LOAD: WizardInsightCard[] = [
  {
    id: "indent-deploy",
    eyebrow: "Indents",
    title: "Deploy in one flow",
    body: "Publish loads to partners and convert awarded indents to trips without re-entry.",
    accent: "indigo",
    illustration: Illustration11,
    icon: IconText,
  },
  {
    id: "finance",
    eyebrow: "Finance",
    title: "Ledger-ready trips",
    body: "Client and supplier rates captured here flow into settlement and invoicing.",
    accent: "amber",
    illustration: Illustration6,
    icon: IconDisc,
  },
];

const LEFT_ATTRIBUTION: WizardInsightCard[] = [
  {
    id: "attribution",
    eyebrow: "Fleet home",
    title: "Driver attribution",
    body: "Accept attributed trips to bill under your fleet while keeping driver commission traceable.",
    accent: "indigo",
    illustration: Illustration20,
    icon: IconRecord,
  },
  {
    id: "clients",
    eyebrow: "CRM",
    title: "Map shippers to clients",
    body: "Link one-time shippers to client records for repeat billing and analytics.",
    accent: "green",
    illustration: Illustration28,
    icon: IconVector,
  },
];

const LEFT_ALLOCATION: WizardInsightCard[] = [
  {
    id: "supply",
    eyebrow: "Supply",
    title: "Asset or aggregate",
    body: "Assign own fleet instantly or capture partner rate and driver phone for market loads.",
    accent: "indigo",
    illustration: Illustration20,
    icon: IconRecord,
  },
  {
    id: "assign-later",
    eyebrow: "Flex",
    title: "Assign later",
    body: "Create the trip now and add vehicle or driver details before dispatch.",
    accent: "amber",
    illustration: Illustration6,
    icon: IconDisc,
  },
];

const RIGHT_STEPPED: WizardInsightCard[] = [
  {
    id: "tip-keyboard",
    eyebrow: "Pro tip",
    title: "Use the keypad",
    body: "Amount fields use the built-in keypad — faster and fewer entry errors on mobile and web.",
    accent: "indigo",
    illustration: Illustration11,
    icon: IconText,
  },
];

const RIGHT_DESKTOP_FORM: WizardInsightCard[] = [
  {
    id: "tip-review",
    eyebrow: "Quick tips",
    title: "Review before sharing",
    body: "Route, client, commercials, and load details publish together to your network partners.",
    accent: "indigo",
    illustration: Illustration11,
    icon: IconText,
  },
];

export function wizardInsightCardsForPreset(
  preset: WizardInsightPreset,
  options?: { desktopForm?: boolean },
): { left: WizardInsightCard[]; right: WizardInsightCard[] } {
  /** Enterprise desktop forms use full-width layout — no marketing side rails. */
  if (options?.desktopForm) {
    return { left: [], right: [] };
  }
  const left =
    preset === "load"
      ? LEFT_LOAD
      : preset === "attribution"
        ? LEFT_ATTRIBUTION
        : preset === "allocation"
          ? LEFT_ALLOCATION
          : LEFT_TRIP;
  const right = options?.desktopForm ? RIGHT_DESKTOP_FORM : RIGHT_STEPPED;
  return { left, right };
}
