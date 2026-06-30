import { readFileSync } from 'fs';
import yaml from 'js-yaml';
import { IDENTITY_V1_OPERATIONS, type HttpMethod } from './operations';

interface OpenApiPathItem {
  get?:    { operationId?: string; responses?: Record<string, unknown> };
  post?:   { operationId?: string; responses?: Record<string, unknown> };
}

interface OpenApiDocument {
  paths?: Record<string, OpenApiPathItem>;
}

export interface OpenApiDriftIssue {
  kind:    'missing_path' | 'missing_method' | 'operation_id_mismatch' | 'status_mismatch';
  message: string;
}

export function loadOpenApiDocument(filePath: string): OpenApiDocument {
  const raw = readFileSync(filePath, 'utf8');
  return yaml.load(raw) as OpenApiDocument;
}

export function compareOpenApiToOperations(filePath: string): OpenApiDriftIssue[] {
  const doc = loadOpenApiDocument(filePath);
  const issues: OpenApiDriftIssue[] = [];

  for (const spec of Object.values(IDENTITY_V1_OPERATIONS)) {
    const pathItem = doc.paths?.[spec.path];
    if (!pathItem) {
      issues.push({ kind: 'missing_path', message: `OpenAPI missing path ${spec.path}` });
      continue;
    }

    const methodKey = spec.method.toLowerCase() as 'get' | 'post';
    const operation = pathItem[methodKey];
    if (!operation) {
      issues.push({ kind: 'missing_method', message: `OpenAPI missing ${spec.method} ${spec.path}` });
      continue;
    }

    if (operation.operationId !== spec.operationId) {
      issues.push({
        kind:    'operation_id_mismatch',
        message: `${spec.method} ${spec.path}: expected operationId ${spec.operationId}, got ${operation.operationId}`,
      });
    }

    const documentedStatuses = new Set(
      Object.keys(operation.responses ?? {}).map(code => Number(code)),
    );
    const expectedStatuses = new Set(Object.keys(spec.responses).map(Number));

    for (const status of expectedStatuses) {
      if (!documentedStatuses.has(status)) {
        issues.push({
          kind:    'status_mismatch',
          message: `${spec.method} ${spec.path}: OpenAPI missing response status ${status}`,
        });
      }
    }
  }

  return issues;
}

export function listOperationKeys(): string[] {
  return Object.keys(IDENTITY_V1_OPERATIONS);
}

export function operationKey(method: HttpMethod, path: string): string {
  return `${method} ${path}`;
}
