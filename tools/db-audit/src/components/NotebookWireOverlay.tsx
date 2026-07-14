import { useMemo } from 'react';
import type { FlowStep } from '@/lib/flowStep.types';
import { buildFlowRailAttachments } from '@/lib/flowRailAttachments';
import type { MindNode } from '@/lib/mindMap.types';
import { defaultExpandedIds } from '@/lib/mindMap.types';
import { MindMapCanvas } from '@/components/MindMapCanvas';

function stepToMindTree(step: FlowStep): MindNode {
  const attachments = buildFlowRailAttachments(step);
  return {
    id: `root-${step.id}`,
    label: step.title,
    kind: 'root',
    detail: step.subtitle,
    children: attachments.length
      ? attachments.map((att) => ({
          id: att.id,
          label: att.label,
          kind: att.kind,
          detail: att.detail,
          lanes: att.lanes,
          children: (att.children ?? []).map((c) => ({
            id: c.id,
            label: c.label,
            kind: c.kind,
            detail: c.detail,
            lanes: c.lanes,
            children: [],
          })),
        }))
      : [{ id: 'ui-only', label: 'UI only — no DB writes', kind: 'field', children: [] }],
  };
}

/** Per-step schema map (inspector / legacy overlay). */
export function NotebookWireMap({
  step,
  compact,
}: {
  step: FlowStep;
  compact?: boolean;
}) {
  const tree = useMemo(() => stepToMindTree(step), [step]);
  const defaults = useMemo(() => defaultExpandedIds(tree), [tree]);
  return <MindMapCanvas tree={tree} defaultExpanded={defaults} compact={compact} />;
}
