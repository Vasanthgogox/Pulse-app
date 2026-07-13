import type { FlowStep } from '@/lib/flowStep.types';

export type InspectorRowLayer = 'meta' | 'ui' | 'auth' | 'db' | 'read' | 'route' | 'note';

export type InspectorTableRow = {
  layer: InspectorRowLayer;
  field: string;
  writesTo: string;
  when: string;
};

const LAYER_LABELS: Record<InspectorRowLayer, string> = {
  meta: 'Meta',
  ui: 'UI field',
  auth: 'Auth metadata',
  db: 'Table',
  read: 'Read',
  route: 'Routing',
  note: 'Note',
};

export function layerLabel(layer: InspectorRowLayer): string {
  return LAYER_LABELS[layer];
}

function authMetadataWritesTo(key: string, step: FlowStep): string {
  const bare = key.split('=')[0].trim().toLowerCase();
  const orgFields = new Set([
    'company_name',
    'operating_model',
    'address_line',
    'locality',
    'pincode',
    'city',
    'state',
    'zone',
    'business_type',
    'employee_count',
  ]);
  const profileFields = new Set(['full_name', 'phone', 'company_name', 'role', 'avatar_seed']);
  const authOnly = new Set([
    'fleet_size_band',
    'monthly_volume_band',
    'office_latitude',
    'office_longitude',
    'onboarding_type',
  ]);

  const parts: string[] = ['auth.users.raw_user_meta_data'];
  if (profileFields.has(bare)) parts.push(`profiles.${bare}`);
  if (orgFields.has(bare) && step.authMetadata?.some((m) => m.includes('onboarding_type=owner'))) {
    parts.push(`organizations.${bare}`);
  }
  if (bare === 'company_name') parts.push('organizations.name');
  if (authOnly.has(bare)) return 'auth.users.raw_user_meta_data only';
  return parts.join(' · ');
}

function tableWritesTo(table: string, step: FlowStep): string {
  const t = table.replace('?', '').trim();
  if (step.phase === 'trigger') {
    if (t === 'public.organizations' || t === 'public.organization_members') {
      return 'INSERT when role=user AND onboarding_type=owner';
    }
    return 'INSERT on auth.users (handle_new_user)';
  }
  if (step.phase === 'auth') {
    if (t === 'auth.users') return 'INSERT via supabase.auth.signUp';
    if (t.startsWith('public.')) return 'INSERT via handle_new_user trigger';
    return 'INSERT / UPDATE';
  }
  if (step.phase === 'post-auth') return 'UPDATE (client after session)';
  if (step.phase === 'join') return 'INSERT / UPDATE (acceptInvitation)';
  return 'READ / WRITE';
}

function whenLabel(step: FlowStep): string {
  switch (step.phase) {
    case 'ui':
      return 'Before auth';
    case 'auth':
      return 'signUp / signIn';
    case 'trigger':
      return 'AFTER INSERT auth.users';
    case 'post-auth':
      return 'After session exists';
    case 'join':
      return 'Post-auth join RPC';
    default:
      return '—';
  }
}

/** Flat rows for inspector table view — derived from step model. */
export function buildStepInspectorRows(step: FlowStep): InspectorTableRow[] {
  const rows: InspectorTableRow[] = [];
  const when = whenLabel(step);

  if (step.route) {
    rows.push({ layer: 'meta', field: 'route', writesTo: step.route, when: 'Navigation' });
  }
  if (step.screen) {
    rows.push({ layer: 'meta', field: 'screen', writesTo: step.screen, when: 'UI module' });
  }
  if (step.service) {
    rows.push({ layer: 'meta', field: 'service', writesTo: step.service, when: when });
  }

  for (const call of step.serviceCalls ?? []) {
    rows.push({ layer: 'meta', field: call, writesTo: 'RPC / service call', when: 'This step' });
  }

  for (const f of step.fields ?? []) {
    rows.push({
      layer: 'ui',
      field: f,
      writesTo: step.phase === 'auth' ? 'signUp() / pending OAuth metadata' : 'Form state',
      when: step.phase === 'post-auth' ? 'Post-auth' : 'This step',
    });
  }

  for (const k of step.authMetadata ?? []) {
    rows.push({
      layer: 'auth',
      field: k,
      writesTo: authMetadataWritesTo(k, step),
      when: 'signUp options.data',
    });
  }

  for (const r of step.reads ?? []) {
    rows.push({ layer: 'read', field: r, writesTo: 'SELECT / RPC', when: 'This step' });
  }

  for (const t of step.tables ?? []) {
    rows.push({
      layer: 'db',
      field: t,
      writesTo: tableWritesTo(t, step),
      when: step.phase === 'trigger' ? 'handle_new_user' : when,
    });
  }

  for (const route of step.routing ?? []) {
    rows.push({
      layer: 'route',
      field: route.context,
      writesTo: `${route.track} → ${route.nextScreen}`,
      when: 'After step completes',
    });
  }

  for (const n of step.notes ?? []) {
    rows.push({ layer: 'note', field: n, writesTo: '—', when: '—' });
  }

  return rows;
}

export function layerRowClass(layer: InspectorRowLayer): string {
  return `insp-layer-${layer}`;
}
