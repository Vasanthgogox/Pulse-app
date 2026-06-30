import { describe, it, expect } from 'vitest';
import path from 'path';
import { assertRepositoryIsolation } from '@pulse/platform-testing';

describe('Repository isolation', () => {
  it('routes, services, and middleware do not query Supabase directly', () => {
    const srcRoot = path.resolve(__dirname, '../../src');
    expect(() => assertRepositoryIsolation(srcRoot)).not.toThrow();
  });
});
