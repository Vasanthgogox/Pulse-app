import { randomUUID } from 'crypto';

export interface TestAuthUser {
  email:    string;
  password: string;
}

export function buildTestAuthUser(label = 'user'): TestAuthUser {
  const id = randomUUID().slice(0, 8);
  return {
    email:    `pulse-test-${label}-${id}@example.com`,
    password: `Test-${id}!Aa`,
  };
}
