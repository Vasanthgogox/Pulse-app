import type { FlowStep } from '@/lib/flowStep.types';
import { getStepOperationBadges } from '@/lib/stepOperationBadges';

export type FlowRailAttachmentKind = 'read' | 'write' | 'service' | 'route' | 'field' | 'event' | 'fanout';

export type FlowRailAttachment = {
  id: string;
  kind: FlowRailAttachmentKind;
  label: string;
  detail?: string;
  /** Nested wires hanging under this attach (fan-out children) */
  children?: { id: string; kind: FlowRailAttachmentKind; label: string; detail?: string; lanes?: string[] }[];
  lanes?: string[];
};

export function buildFlowRailAttachments(step: FlowStep): FlowRailAttachment[] {
  if (step.wire?.nodes?.length) {
    return buildAttachmentsFromWire(step);
  }
  return buildDefaultAttachments(step);
}

function buildAttachmentsFromWire(step: FlowStep): FlowRailAttachment[] {
  const diagram = step.wire!;
  const out: FlowRailAttachment[] = [];

  for (const node of diagram.nodes) {
    if (node.kind === 'fanout' && node.branches?.length) {
      out.push({
        id: `wire-${node.id}`,
        kind: 'fanout',
        label: node.label,
        detail: node.detail,
        lanes: node.lanes,
        children: node.branches.map((b, i) => ({
          id: `wire-${node.id}-b${i}`,
          kind: 'write' as const,
          label: b.label,
          detail: b.detail,
          lanes: b.lanes,
        })),
      });
      continue;
    }

    const kind: FlowRailAttachmentKind =
      node.kind === 'event'
        ? 'event'
        : node.kind === 'service'
          ? 'service'
          : node.kind === 'write'
            ? 'write'
            : node.kind === 'fanout'
              ? 'fanout'
              : 'write';

    out.push({
      id: `wire-${node.id}`,
      kind,
      label: node.label,
      detail: node.detail,
      lanes: node.lanes,
    });
  }

  // Keep tables as trailing writes if not already covered
  for (const t of step.tables ?? []) {
    if (!out.some((a) => a.label === t)) {
      out.push({ id: `write-${t}`, kind: 'write', label: t });
    }
  }

  return out.slice(0, 10);
}

function buildDefaultAttachments(step: FlowStep): FlowRailAttachment[] {
  const out: FlowRailAttachment[] = [];
  const ops = getStepOperationBadges(step);

  if (ops.includes('input') && step.fieldMappings?.length) {
    for (const m of step.fieldMappings.slice(0, 4)) {
      out.push({
        id: `field-${m.input}`,
        kind: 'field',
        label: m.input,
        detail: m.storesTo,
      });
    }
    if (step.fieldMappings.length > 4) {
      out.push({
        id: 'field-more',
        kind: 'field',
        label: `+${step.fieldMappings.length - 4} fields`,
      });
    }
  } else if (ops.includes('input') && step.fields?.length) {
    out.push({
      id: 'fields',
      kind: 'field',
      label: step.fields.slice(0, 3).join(' · '),
      detail: step.fields.length > 3 ? `+${step.fields.length - 3} more` : undefined,
    });
  }

  for (const r of step.reads ?? []) {
    out.push({ id: `read-${r}`, kind: 'read', label: r });
  }

  for (const t of step.tables ?? []) {
    out.push({ id: `write-${t}`, kind: 'write', label: t });
  }

  if (step.service) {
    out.push({ id: 'service', kind: 'service', label: step.service });
  }
  for (const call of step.serviceCalls?.slice(0, 2) ?? []) {
    out.push({ id: `svc-${call}`, kind: 'service', label: call });
  }

  for (const q of step.queries ?? []) {
    const isWrite = /\b(INSERT|UPDATE|DELETE|UPSERT)\b/i.test(q.sql);
    const isRead = /\bSELECT\b/i.test(q.sql);
    if (isWrite && !out.some((a) => a.id === `q-write-${q.label}`)) {
      out.push({ id: `q-write-${q.label}`, kind: 'write', label: q.label });
    } else if (isRead && !out.some((a) => a.id === `q-read-${q.label}`)) {
      out.push({ id: `q-read-${q.label}`, kind: 'read', label: q.label });
    }
  }

  for (const r of step.routing ?? []) {
    out.push({
      id: `route-${r.track}`,
      kind: 'route',
      label: r.context,
      detail: r.nextScreen,
    });
  }

  return out.slice(0, 8);
}
