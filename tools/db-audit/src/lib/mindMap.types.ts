export type MindNodeKind =
  | 'root'
  | 'module'
  | 'phase'
  | 'fork'
  | 'branch'
  | 'step'
  | 'action'
  | 'read'
  | 'write'
  | 'service'
  | 'route'
  | 'field'
  | 'event'
  | 'fanout'
  | 'exit';

export type MindNode = {
  id: string;
  label: string;
  kind: MindNodeKind;
  detail?: string;
  lanes?: string[];
  children: MindNode[];
};

export const MIND_KIND_LABEL: Record<MindNodeKind, string> = {
  root: 'Root',
  module: 'Module',
  phase: 'Phase',
  fork: 'Branch point',
  branch: 'Path',
  step: 'Step',
  action: 'User action',
  read: 'Read',
  write: 'Write',
  service: 'Service',
  route: 'Route',
  field: 'Field',
  event: 'Event',
  fanout: 'Fan-out',
  exit: 'Exit',
};

/** Open root only — children appear collapsed (e.g. three path nodes). */
export function rootOnlyExpandedIds(root: MindNode): Set<string> {
  return new Set<string>([root.id]);
}

/** Open root + first child level (step schema maps). */
export function defaultExpandedIds(root: MindNode): Set<string> {
  const set = new Set<string>([root.id]);
  for (const child of root.children) set.add(child.id);
  return set;
}
