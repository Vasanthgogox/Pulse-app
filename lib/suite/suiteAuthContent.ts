import type { SuiteProductId } from './suiteProducts';

export type SuiteSignInCopy = {
  brandLabel: string;
  heroHeadline: string;
  principles: readonly string[];
  formTitle: string;
  formSubtitle: string;
  primaryCta: string;
  googleCta: string;
  forgotPassword: string;
  footerPrompt: string;
  footerLink: string;
};

const DEFAULT_SIGN_IN_COPY: SuiteSignInCopy = {
  brandLabel: 'Transport Operating System',
  heroHeadline: 'Run your logistics business from one platform.',
  principles: ['One workspace.', 'One team.', 'One source of truth.'] as const,
  formTitle: 'Welcome back',
  formSubtitle: 'Sign in to your Pulse workspace.',
  primaryCta: 'Sign in',
  googleCta: 'Continue with Google',
  forgotPassword: 'Forgot password?',
  footerPrompt: "Don't have a workspace?",
  footerLink: 'Create one',
};

const COMMERCE_SIGN_IN_COPY: SuiteSignInCopy = {
  brandLabel: 'Commerce workspace',
  heroHeadline: 'Catalog, orders, and planning — connected to your transport stack.',
  principles: ['Products & inventory.', 'Sales orders.', 'Execution handoff.'] as const,
  formTitle: 'Welcome back',
  formSubtitle: 'Sign in to your Pulse Commerce workspace.',
  primaryCta: 'Sign in',
  googleCta: 'Continue with Google',
  forgotPassword: 'Forgot password?',
  footerPrompt: "Don't have a Commerce workspace?",
  footerLink: 'Create one',
};

export function suiteSignInCopy(productId: SuiteProductId | null): SuiteSignInCopy {
  if (productId === 'commerce') return COMMERCE_SIGN_IN_COPY;
  return DEFAULT_SIGN_IN_COPY;
}

export type SuiteSignUpCopy = {
  marketingTag: string;
  marketingTitle: string;
  principles: readonly string[];
};

const COMMERCE_SIGN_UP_COPY: SuiteSignUpCopy = {
  marketingTag: 'Commerce workspace',
  marketingTitle: 'Catalog, orders, and planning for your logistics business.',
  principles: ['Products & SKUs.', 'Sales orders.', 'Warehouse inventory.'] as const,
};

const DEFAULT_SIGN_UP_COPY: SuiteSignUpCopy = {
  marketingTag: 'Business activation',
  marketingTitle: 'One workspace for your entire transport business.',
  principles: ['One workspace.', 'One team.', 'One source of truth.'] as const,
};

export function suiteSignUpCopy(productId: SuiteProductId | null): SuiteSignUpCopy {
  if (productId === 'commerce') return COMMERCE_SIGN_UP_COPY;
  return DEFAULT_SIGN_UP_COPY;
}
