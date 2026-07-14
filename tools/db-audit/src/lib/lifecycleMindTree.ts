import type { FlowAppModule, FlowBranch, FlowStep, FlowWizardTrack, PersonaFlow } from '@/lib/flowStep.types';
import { APP_FLOWS, getAppModules } from '@/lib/appFlowModel';
import { getStepOperationBadges } from '@/lib/stepOperationBadges';
import type { MindNode } from '@/lib/mindMap.types';

function cloneNode(n: MindNode, idSuffix = ''): MindNode {
  return {
    ...n,
    id: idSuffix ? `${n.id}${idSuffix}` : n.id,
    children: n.children.map((c) => cloneNode(c, idSuffix)),
  };
}

/**
 * Append `next` at the end of a single left→right spine.
 * User-action nodes: open › → Backend (optional) + next UI step.
 * Module / path branch with parallel steps: all steps fan out, then ONE next joins.
 * Forks: each path gets a uniquely-id'd copy of next (paths rejoin after classifier).
 */
function appendNextInSeries(host: MindNode, next: MindNode): MindNode {
  if (host.kind === 'fork') {
    return {
      ...host,
      children: host.children.map((branch) =>
        appendNextInSeries(branch, cloneNode(next, `__via-${branch.id}`)),
      ),
    };
  }

  // UI step: Backend dig-down stays; next action is the continue sibling
  if (host.kind === 'action') {
    const backend = host.children.find((c) => c.kind === 'phase' && /^Backend$/i.test(c.label));
    return {
      ...host,
      children: [...(backend ? [cloneNode(backend)] : []), next],
    };
  }

  // Module or path branch: drill single child; else parallel step fan → join next
  if (host.kind === 'module' || host.kind === 'branch') {
    if (host.children.length === 1) {
      return {
        ...host,
        children: [appendNextInSeries(host.children[0]!, next)],
      };
    }
    const parallelFan =
      host.children.length > 0 &&
      host.children.every((c) => c.kind === 'action' || c.kind === 'fork' || c.kind === 'exit');
    if (parallelFan) {
      return {
        ...host,
        children: [...host.children.map((c) => cloneNode(c)), next],
      };
    }
  }

  if (host.children.length === 0) {
    return { ...host, children: [next] };
  }

  if (host.children.length === 1) {
    return {
      ...host,
      children: [appendNextInSeries(host.children[0]!, next)],
    };
  }

  const kids = host.children.map((c) => cloneNode(c));
  const last = kids.length - 1;
  kids[last] = appendNextInSeries(kids[last]!, next);
  return { ...host, children: kids };
}

function isOAuthBranch(branch: FlowBranch): boolean {
  return branch.badge === 'oauth' || /google|oauth/i.test(branch.id);
}

/** Steps for one signup path — OAuth skips shared phone/OTP preamble. */
function signupPathSteps(persona: PersonaFlow, branch: FlowBranch): FlowStep[] {
  const shared = isOAuthBranch(branch) ? [] : persona.sharedSteps;
  return [...shared, ...branch.steps, ...(persona.tailSteps ?? [])];
}

function signupClassifierLabel(persona: PersonaFlow): string {
  if (persona.id === 'driver') return 'Choose entry';
  if (persona.branches.every((b) => b.badge === 'invite')) return 'Choose invite path';
  if (persona.branches.some(isOAuthBranch)) return 'Choose signup path';
  return 'Choose path';
}

/** Modules / phases / steps in series: open › for next only. */
function chainInSeries(nodes: MindNode[]): MindNode[] {
  if (!nodes.length) return [];
  let acc = nodes[nodes.length - 1]!;
  for (let i = nodes.length - 2; i >= 0; i--) {
    acc = appendNextInSeries(nodes[i]!, acc);
  }
  return [acc];
}

function chainModulesInSeries(modules: MindNode[]): MindNode[] {
  return chainInSeries(modules);
}

function userFieldNodes(step: FlowStep, prefix: string): MindNode[] {
  if (step.fieldMappings?.length) {
    return step.fieldMappings.map((m, i) => ({
      id: `${prefix}-field-${i}-${m.input}`,
      label: m.input,
      kind: 'field' as const,
      detail: m.storesTo ? `→ ${m.storesTo}` : 'User input',
      children: [] as MindNode[],
    }));
  }
  if (step.fields?.length) {
    return step.fields.map((f, i) => ({
      id: `${prefix}-field-${i}`,
      label: f,
      kind: 'field' as const,
      detail: 'User input',
      children: [] as MindNode[],
    }));
  }
  return [];
}

function systemNodes(step: FlowStep, prefix: string): MindNode[] {
  const out: MindNode[] = [];
  for (const r of step.reads ?? []) {
    out.push({ id: `${prefix}-read-${r}`, label: r, kind: 'read', children: [] });
  }
  for (const t of step.tables ?? []) {
    out.push({ id: `${prefix}-write-${t}`, label: t, kind: 'write', children: [] });
  }
  if (step.service) {
    out.push({ id: `${prefix}-svc`, label: step.service, kind: 'service', children: [] });
  }
  for (const call of step.serviceCalls?.slice(0, 3) ?? []) {
    out.push({ id: `${prefix}-svc-${call}`, label: call, kind: 'service', children: [] });
  }
  for (const r of step.routing ?? []) {
    out.push({
      id: `${prefix}-route-${r.track}`,
      label: r.context,
      kind: 'route',
      detail: r.nextScreen,
      children: [],
    });
  }
  return out;
}

function actionBadge(step: FlowStep): string {
  const ops = getStepOperationBadges(step);
  const parts = [step.label];
  if (ops.length) parts.push(ops.map((o) => o.toUpperCase()).join(' · '));
  return parts.join(' · ');
}

/** Host screen / modal for grouping wizard pages that share one UI shell. */
function screenFamily(step: FlowStep): string {
  const raw = step.screen ?? '';
  const parts = raw
    .split('·')
    .map((p) => p.trim())
    .filter(Boolean);
  const host =
    parts.find((p) => /Screen$|Modal|Shell/i.test(p)) ?? parts[parts.length - 1] ?? step.route ?? step.id;
  return host.replace(/\s+/g, ' ');
}

function groupConsecutiveByScreen(steps: FlowStep[]): FlowStep[][] {
  const groups: FlowStep[][] = [];
  for (const step of steps) {
    const key = screenFamily(step);
    const last = groups[groups.length - 1];
    if (last && screenFamily(last[0]!) === key) last.push(step);
    else groups.push([step]);
  }
  return groups;
}

function dedupeFields(fields: MindNode[]): MindNode[] {
  const seen = new Set<string>();
  const out: MindNode[] = [];
  for (const f of fields) {
    let key = f.label.replace(/\s+/g, ' ').toLowerCase();
    if (/\bphone\b/.test(key)) key = 'phone';
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key === 'phone' ? { ...f, label: 'phone', detail: f.detail || 'User input' } : f);
  }
  return out;
}

function fieldHintFromSteps(steps: FlowStep[], prefix: string): string {
  const fields = dedupeFields(steps.flatMap((s, i) => userFieldNodes(s, `${prefix}-p${i}`)));
  return fields.length ? `Enter: ${fields.map((f) => f.label).join(' · ')}` : '';
}

function backendPhase(steps: FlowStep[], prefix: string): MindNode | null {
  const system = steps.flatMap((s, i) => systemNodes(s, `${prefix}-b${i}`));
  // Dedupe by label
  const seen = new Set<string>();
  const kids: MindNode[] = [];
  for (const n of system) {
    if (seen.has(n.label)) continue;
    seen.add(n.label);
    kids.push(n);
  }
  if (!kids.length) return null;
  return {
    id: `${prefix}-backend`,
    label: 'Backend',
    kind: 'phase',
    detail: 'Reads · writes · services — expand for this step',
    children: kids,
  };
}

/**
 * One clean User action node (fields in detail).
 * Open › → Backend only (+ next UI step when chained).
 */
function modalOrStepAction(steps: FlowStep[], prefix: string): MindNode {
  const backend = backendPhase(steps, prefix);
  const enter = fieldHintFromSteps(steps, prefix);

  if (steps.length === 1) {
    const step = steps[0]!;
    const dbHint = backend
      ? `DB: ${backend.children
          .slice(0, 3)
          .map((s) => s.label)
          .join(' · ')}`
      : '';
    return {
      id: `${prefix}-step-${step.id}`,
      label: step.title,
      kind: 'action',
      detail: [actionBadge(step), step.subtitle, enter, dbHint].filter(Boolean).join(' — '),
      children: backend ? [backend] : [],
    };
  }

  const host = screenFamily(steps[0]!);
  const titles = steps.map((s) => s.title).join(' · ');
  return {
    id: `${prefix}-modal-${steps.map((s) => s.id).join('+')}`,
    label: titles,
    kind: 'action',
    detail: [`Single UI · ${host}`, enter].filter(Boolean).join(' — '),
    children: backend ? [backend] : [],
  };
}

/** Linear / modal-grouped UI → next › … → join (e.g. handle_new_user). */
function chainSteps(steps: FlowStep[], prefix: string): MindNode[] {
  if (!steps.length) return [];
  const groups = groupConsecutiveByScreen(steps);
  return chainInSeries(groups.map((g, i) => modalOrStepAction(g, `${prefix}-m${i}`)));
}

function branchNode(branch: FlowBranch, prefix: string): MindNode {
  return {
    id: `${prefix}-branch-${branch.id}`,
    label: branch.label,
    kind: 'branch',
    detail: branch.summary,
    children: chainSteps(branch.steps, `${prefix}-${branch.id}`),
  };
}

function trackNode(track: FlowWizardTrack, mode: 'create' | 'manage', prefix: string): MindNode {
  const parts: MindNode[] = [];

  if (track.allocationSteps.length) {
    parts.push({
      id: `${prefix}-${track.id}-alloc`,
      label: mode === 'create' ? '④ Allocate' : 'Re-assign',
      kind: 'phase',
      detail: 'Choose resources',
      children: chainSteps(track.allocationSteps, `${prefix}-${track.id}-alloc`),
    });
  }

  if (track.submitSteps?.length) {
    parts.push({
      id: `${prefix}-${track.id}-submit`,
      label: '⑤ Save trip',
      kind: 'phase',
      detail: 'Persist trip row',
      children: chainSteps(track.submitSteps, `${prefix}-${track.id}-submit`),
    });
  }

  if (track.submitForks?.length) {
    parts.push({
      id: `${prefix}-${track.id}-forks`,
      label: 'Save forks',
      kind: 'fork',
      detail: 'Alternate save paths',
      children: track.submitForks.map((fork) => ({
        id: `${prefix}-${fork.id}`,
        label: fork.label,
        kind: 'branch' as const,
        detail: fork.summary,
        children: chainSteps(fork.steps, `${prefix}-${fork.id}`),
      })),
    });
  }

  if (track.lifecycleSteps?.length) {
    parts.push({
      id: `${prefix}-${track.id}-life`,
      label: mode === 'create' ? '⑥ After create' : 'After re-assign',
      kind: 'phase',
      detail: 'Parties · OTP · chat · finance · visibility',
      children: chainSteps(track.lifecycleSteps, `${prefix}-${track.id}-life`),
    });
  }

  for (const exit of track.exits ?? []) {
    parts.push({
      id: `${prefix}-${track.id}-exit-${exit.route}`,
      label: `Exit · ${exit.label}`,
      kind: 'exit',
      detail: exit.route + (exit.context ? ` · ${exit.context}` : ''),
      children: [],
    });
  }

  return {
    id: `${prefix}-track-${track.id}`,
    label: track.label,
    kind: 'branch',
    detail: track.summary,
    children: chainInSeries(parts),
  };
}

function moduleToMind(mod: FlowAppModule, persona: PersonaFlow, lane: string): MindNode {
  const prefix = `${lane}__${mod.id}`;
  let children: MindNode[] = [];

  if (mod.kind === 'signup-embed') {
    // Classifier first (phone path vs Google OAuth / signup vs sign-in),
    // then each path fans its steps in parallel and joins to the next module.
    const paths: FlowBranch[] = persona.branches.length
      ? persona.branches
      : [
          {
            id: 'default',
            label: 'Default',
            summary: persona.description,
            steps: [...persona.sharedSteps, ...(persona.tailSteps ?? [])],
          },
        ];

    children = [
      {
        id: `${prefix}-entry`,
        label: signupClassifierLabel(persona),
        kind: 'fork',
        detail: paths.map((b) => b.label).join(' · '),
        children: paths.map((b) => {
          const steps = signupPathSteps(persona, b);
          // All wizard steps stay visible as siblings (east of path); layout is a clean column + one join.
          return {
            id: `${prefix}-path-${b.id}`,
            label: b.label,
            kind: 'branch' as const,
            detail: b.summary,
            children: steps.map((s, i) => modalOrStepAction([s], `${prefix}-${b.id}-s${i}`)),
          };
        }),
      },
    ];
  } else if (mod.kind === 'branch-embed' && mod.embeddedBranches?.length) {
    children = [
      {
        id: `${prefix}-party-fork`,
        label: 'Party types',
        kind: 'fork',
        detail: 'Register one type at a time',
        children: mod.embeddedBranches.map((b) => branchNode(b, prefix)),
      },
    ];
  } else if (mod.kind === 'wizard-embed') {
    const mode = mod.wizardTrackMode ?? 'create';
    const parts: MindNode[] = [];
    if (mod.embeddedPrefixSteps?.length) {
      parts.push({
        id: `${prefix}-prefix`,
        label: mode === 'create' ? 'Route → Load → Sale' : 'Trip detail',
        kind: 'phase',
        detail: 'Shared before journey fork',
        children: chainSteps(mod.embeddedPrefixSteps, `${prefix}-prefix`),
      });
    }
    if (mod.embeddedTracks?.length) {
      parts.push({
        id: `${prefix}-journeys`,
        label: mode === 'create' ? 'Choose journey' : 'Re-assign path',
        kind: 'fork',
        detail: `${mod.embeddedTracks.length} tracks · Asset / Aggregate`,
        children: mod.embeddedTracks.map((t) => trackNode(t, mode, prefix)),
      });
    }
    if (mod.embeddedSuffixSteps?.length) {
      parts.push({
        id: `${prefix}-suffix`,
        label: 'Shared ops',
        kind: 'phase',
        detail: 'After track join',
        children: chainSteps(mod.embeddedSuffixSteps, `${prefix}-suffix`),
      });
    }
    children = chainInSeries(parts);
  } else if (mod.embeddedStepGroups?.length) {
    const parts = mod.embeddedStepGroups.map((g) => ({
      id: `${prefix}-g-${g.id}`,
      label: g.label,
      kind: 'phase' as const,
      detail: g.summary,
      children: chainSteps(g.steps, `${prefix}-g-${g.id}`),
    }));
    children = chainInSeries(parts);
  } else if (mod.embeddedSteps?.length) {
    children = chainSteps(mod.embeddedSteps, prefix);
  }

  return {
    id: prefix,
    label: `${mod.order}. ${mod.title}`,
    kind: 'module',
    detail: `${mod.stepCount} steps${mod.variantCount ? ` · ${mod.variantCount} variants` : ''} — ${mod.summary}`,
    children,
  };
}

function withBranches(persona: PersonaFlow, branchIds: string[]): PersonaFlow {
  return {
    ...persona,
    branches: persona.branches.filter((b) => branchIds.includes(b.id)),
  };
}

function laneTree(
  laneId: string,
  label: string,
  detail: string,
  persona: PersonaFlow,
): MindNode {
  const modules = getAppModules(persona).map((m) => moduleToMind(m, persona, laneId));
  return {
    id: `lane-${laneId}`,
    label,
    kind: 'branch',
    detail,
    children: chainModulesInSeries(modules),
  };
}

/**
 * Unified mind map: root fans into Org owner · Driver · Team member,
 * each with App-flow modules in series and user-enter fields per step.
 */
export function buildLifecycleMindTree(): MindNode {
  const business = APP_FLOWS.find((p) => p.id === 'business')!;
  const driver = APP_FLOWS.find((p) => p.id === 'driver')!;

  const owner = withBranches(business, ['owner', 'google-owner']);
  const team = withBranches(business, ['team-new', 'team-existing']);

  return {
    id: 'life-pulse',
    label: 'Pulse lifecycle',
    kind: 'root',
    detail: 'Who is using the app — open › for that person’s full path',
    children: [
      laneTree(
        'owner',
        'Org owner',
        'Business user · provisions & owns the organization',
        owner,
      ),
      laneTree(
        'driver',
        'Driver',
        'Registry signup or phone sign-in · no org ownership',
        driver,
      ),
      laneTree(
        'team',
        'Team member',
        'Invited dispatcher · joins existing org workspace',
        team,
      ),
    ],
  };
}
