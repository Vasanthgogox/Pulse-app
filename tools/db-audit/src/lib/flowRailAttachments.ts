import type { FlowStep } from '@/lib/flowStep.types';
import { getStepOperationBadges } from '@/lib/stepOperationBadges';

export type FlowRailAttachmentKind = 'read' | 'write' | 'service' | 'route' | 'field';

export type FlowRailAttachment = {
  id: string;
  kind: FlowRailAttachmentKind;
  label: string;
  detail?: string;
};

export function buildFlowRailAttachments(step: FlowStep): FlowRailAttachment[] {
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
