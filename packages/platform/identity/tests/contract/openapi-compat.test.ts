import { describe, it, expect } from 'vitest';
import path from 'path';
import { compareOpenApiToOperations } from '@pulse/platform-testing';

const OPENAPI_PATH = path.resolve(__dirname, '../../../../../oms/docs/api/identity-v1.yaml');

describe('Identity v1 OpenAPI compatibility', () => {
  it('documents every operation in the contract registry', () => {
    const issues = compareOpenApiToOperations(OPENAPI_PATH);
    expect(issues).toEqual([]);
  });
});
