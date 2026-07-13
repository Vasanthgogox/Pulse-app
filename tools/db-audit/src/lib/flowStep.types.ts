export type PersonaId = 'business' | 'driver';

export type FlowStepPhase = 'ui' | 'auth' | 'trigger' | 'post-auth' | 'join';

/** Where the resolver sends the user after this step completes. */
export type FlowRoutingOutcome = {
  context: string;
  track: string;
  nextScreen: string;
};

/** Exact SQL / PostgREST for audit inspector. */
export type FlowStepQuery = {
  label: string;
  sql: string;
  when: string;
};

/** UI label → where the value is persisted (roster / wizard steps). */
export type FlowFieldMapping = {
  input: string;
  storesTo: string;
};

export type FlowStep = {
  id: string;
  order: number;
  label: string;
  title: string;
  subtitle?: string;
  route?: string;
  screen?: string;
  service?: string;
  /** Additional service/RPC calls beyond `service` summary */
  serviceCalls?: string[];
  phase: FlowStepPhase;
  fields?: string[];
  /** Per-field persistence map — shown on step cards and inspector table */
  fieldMappings?: FlowFieldMapping[];
  authMetadata?: string[];
  /** Tables written or updated */
  tables?: string[];
  /** Tables/RPCs read (no writes) */
  reads?: string[];
  /** Resolver / routing branches produced by this step */
  routing?: FlowRoutingOutcome[];
  notes?: string[];
  /** Literal queries (SQL or PostgREST) for audit — not inferred. */
  queries?: FlowStepQuery[];
};

export type FlowBranch = {
  id: string;
  label: string;
  summary: string;
  badge?: string;
  steps: FlowStep[];
};

/** Where the user lands after a wizard track completes. */
export type FlowTrackExit = {
  label: string;
  route: string;
  context?: string;
};

/** Rare alternate save path within the same allocation choice. */
export type FlowWizardSubmitFork = {
  id: string;
  label: string;
  summary?: string;
  steps: FlowStep[];
  exits?: FlowTrackExit[];
};

/** End-to-end path: shared prefix → allocation → save → exit (Create trip). */
export type FlowWizardTrack = {
  id: string;
  label: string;
  summary: string;
  badge?: string;
  allocationSteps: FlowStep[];
  submitSteps?: FlowStep[];
  submitForks?: FlowWizardSubmitFork[];
  exits?: FlowTrackExit[];
};

export type PersonaFlow = {
  id: PersonaId;
  label: string;
  route: string;
  screen: string;
  description: string;
  sharedSteps: FlowStep[];
  branches: FlowBranch[];
  tailSteps?: FlowStep[];
};

/** Top-level app flow segment shown in Pulse Flow Map. */
export type FlowAppModuleKind = 'signup-embed' | 'branch-embed' | 'steps' | 'wizard-embed';

export type FlowAppModule = {
  id: string;
  order: number;
  label: string;
  title: string;
  summary: string;
  route: string;
  screen: string;
  kind: FlowAppModuleKind;
  variantCount: number;
  stepCount: number;
  /** Linear inner steps when kind === 'steps' */
  embeddedSteps?: FlowStep[];
  /** Section heading inside expanded linear module */
  embeddedSectionLabel?: string;
  /** Bifurcated step groups (e.g. fleet prep vs wizard) */
  embeddedStepGroups?: { id: string; label: string; summary?: string; steps: FlowStep[] }[];
  /** Collapsible party-type branches (fleet roster) */
  embeddedBranches?: FlowBranch[];
  /** Wizard prefix (route, load, sale) before tracks */
  embeddedPrefixSteps?: FlowStep[];
  /** End-to-end tracks (allocation → save → exit) — preferred for Create/Manage trip */
  embeddedTracks?: FlowWizardTrack[];
  /** @deprecated Use embeddedTracks — allocation-only branch list */
  embeddedAllocationBranches?: FlowBranch[];
  /** @deprecated Use embeddedTracks — submit-only branch list */
  embeddedSubmitBranches?: FlowBranch[];
  /** Steps after tracks (manage: ops, verify) */
  embeddedSuffixSteps?: FlowStep[];
  /** create = Allocate+Save labels; manage = Re-assign paths only */
  wizardTrackMode?: 'create' | 'manage';
};
