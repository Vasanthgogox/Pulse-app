import type { FlowStep, FlowStepQuery } from '@/lib/flowStep.types';

export type StepOp = 'input' | 'read' | 'write';

const NO_WRITE_RE =
  /no db (write|read\/write)|no writes?|form state|stored locally|asyncstorage|client-side only|ui only|not select on|mock otp/i;
const NO_READ_RE = /no db read|no reads?|no db read\/write/i;

function queryBlob(q: FlowStepQuery): string {
  return `${q.label} ${q.sql}`;
}

function queryIndicatesWrite(q: FlowStepQuery): boolean {
  const blob = queryBlob(q);
  if (NO_WRITE_RE.test(blob)) return false;
  return /\b(INSERT|UPDATE|DELETE|UPSERT|handle_new_user|signUp|signInWithPassword|accept_pending|update_organization|updateProfile|establishLink|uploadDriverDocuments|persistProfilePhoto)\b/i.test(
    blob,
  );
}

function queryIndicatesRead(q: FlowStepQuery): boolean {
  const blob = queryBlob(q);
  if (NO_READ_RE.test(blob)) return false;
  if (queryIndicatesWrite(q)) return false;
  return /\b(SELECT|get_|resolve_|check_|expire_|organization_name_is_taken|get_email_by_phone|get_organizations)\b/i.test(
    blob,
  );
}

/** Derive Input / Read / Write badges shown on each step card. */
export function getStepOperationBadges(step: FlowStep): StepOp[] {
  const ops: StepOp[] = [];

  const hasInput = (step.fields?.length ?? 0) > 0 || (step.fieldMappings?.length ?? 0) > 0;
  if (hasInput) ops.push('input');

  const hasReads =
    (step.reads?.length ?? 0) > 0 ||
    (step.queries?.some((q) => queryIndicatesRead(q)) ?? false) ||
    (step.phase === 'ui' && /check|get|resolve|read/i.test(step.service ?? ''));

  const hasWrites =
    (step.tables?.length ?? 0) > 0 ||
    step.phase === 'auth' ||
    step.phase === 'trigger' ||
    step.phase === 'join' ||
    (step.phase === 'post-auth' &&
      ((step.tables?.length ?? 0) > 0 ||
        /update|upload|persist|logo|photo/i.test(`${step.service ?? ''} ${step.serviceCalls?.join(' ') ?? ''}`))) ||
    (step.queries?.some((q) => queryIndicatesWrite(q)) ?? false);

  if (hasReads) ops.push('read');
  if (hasWrites) ops.push('write');

  return ops;
}

/** Badges for connector arrows — data leaves the step (read / write), not user input. */
export function getStepConnectorBadges(step: FlowStep): Array<'read' | 'write'> {
  return getStepOperationBadges(step).filter((op): op is 'read' | 'write' => op !== 'input');
}

export const STEP_OP_LABELS: Record<StepOp, string> = {
  input: 'Input',
  read: 'Read',
  write: 'Write',
};
