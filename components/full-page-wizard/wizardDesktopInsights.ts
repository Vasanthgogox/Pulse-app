import type { WizardInsightCard } from "./WizardInsightRail";

export type WizardInsightPreset = "trip" | "load" | "attribution" | "allocation";

const LEFT_TRIP: WizardInsightCard[] = [
  {
    id: "live-tracking",
    eyebrow: "Operations",
    title: "Live trip tracking",
    body: "Share driver location with clients and cut status calls during in-transit trips.",
    accent: "indigo",
  },
  {
    id: "network",
    eyebrow: "Network",
    title: "Find return loads",
    body: "Browse Load Center to match empty legs with partner indents in your lane.",
    accent: "green",
  },
];

const LEFT_LOAD: WizardInsightCard[] = [
  {
    id: "indent-deploy",
    eyebrow: "Indents",
    title: "Deploy in one flow",
    body: "Publish loads to partners and convert awarded indents to trips without re-entry.",
    accent: "indigo",
  },
  {
    id: "finance",
    eyebrow: "Finance",
    title: "Ledger-ready trips",
    body: "Client and supplier rates captured here flow into settlement and invoicing.",
    accent: "amber",
  },
];

const LEFT_ATTRIBUTION: WizardInsightCard[] = [
  {
    id: "attribution",
    eyebrow: "Fleet home",
    title: "Driver attribution",
    body: "Accept attributed trips to bill under your fleet while keeping driver commission traceable.",
    accent: "indigo",
  },
  {
    id: "clients",
    eyebrow: "CRM",
    title: "Map shippers to clients",
    body: "Link one-time shippers to client records for repeat billing and analytics.",
    accent: "green",
  },
];

const LEFT_ALLOCATION: WizardInsightCard[] = [
  {
    id: "supply",
    eyebrow: "Supply",
    title: "Asset or aggregate",
    body: "Assign own fleet instantly or capture partner rate and driver phone for market loads.",
    accent: "indigo",
  },
  {
    id: "assign-later",
    eyebrow: "Flex",
    title: "Assign later",
    body: "Create the trip now and add vehicle or driver details before dispatch.",
    accent: "amber",
  },
];

const RIGHT_STEPPED: WizardInsightCard[] = [
  {
    id: "tip-keyboard",
    eyebrow: "Pro tip",
    title: "Use the keypad",
    body: "Amount fields use the built-in keypad — faster and fewer entry errors on mobile and web.",
    accent: "indigo",
  },
];

const RIGHT_DESKTOP_FORM: WizardInsightCard[] = [
  {
    id: "tip-review",
    eyebrow: "Quick tips",
    title: "Review before sharing",
    body: "Route, client, commercials, and load details publish together to your network partners.",
    accent: "indigo",
  },
];

export function wizardInsightCardsForPreset(
  preset: WizardInsightPreset,
  options?: { desktopForm?: boolean },
): { left: WizardInsightCard[]; right: WizardInsightCard[] } {
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
