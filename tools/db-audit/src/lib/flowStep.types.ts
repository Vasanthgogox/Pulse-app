export type PersonaId = 'business' | 'driver';

export type FlowStepPhase = 'ui' | 'auth' | 'trigger' | 'post-auth' | 'join';

/** Where the resolver sends the user after this step completes. */
export type FlowRoutingOutcome = {
  context: string;
  track: string;
  nextScreen: string;
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
  authMetadata?: string[];
  /** Tables written or updated */
  tables?: string[];
  /** Tables/RPCs read (no writes) */
  reads?: string[];
  /** Resolver / routing branches produced by this step */
  routing?: FlowRoutingOutcome[];
  notes?: string[];
};

export type FlowBranch = {
  id: string;
  label: string;
  summary: string;
  badge?: string;
  steps: FlowStep[];
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

/** Top-level app flow segment (e.g. Signup) — embeds a full PersonaFlow when expanded. */
export type FlowAppModule = {
  id: string;
  order: number;
  label: string;
  title: string;
  summary: string;
  route: string;
  screen: string;
  variantCount: number;
  /** Longest path: shared + max branch + tail */
  stepCount: number;
};
