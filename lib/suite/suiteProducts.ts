import type { SuiteProductId } from './suiteProductModule';
import type { SuiteProductModule } from './suiteProductModule';
import { ROUTES } from '@/lib/routes';
import {
  PULSE_COMMERCE_BRAND_WORD,
  PULSE_CORE_BRAND_WORD,
  PULSE_INVOICE_BRAND_WORD,
  PULSE_PILOT_BRAND_WORD,
  PULSE_POD_BRAND_WORD,
} from '@/lib/brand/pulseBrandMark.tokens';

export type { SuiteProductId } from './suiteProductModule';

/** Products that currently render the shared Expo PulseProductShell. */
export type ExpoProductShellId = Extract<SuiteProductId, 'invoice' | 'pod'>;

export type SuiteProductDefinition = {
  id: SuiteProductId;
  brandWord: string;
  name: string;
  tagline: string;
  /** In-app path after auth (web). */
  appBasePath: string;
  /** Post-signup activation path inside the product app. */
  activationPath: string;
  signUpRoute: string;
  /**
   * Dedicated Expo product chrome (brand + identity + profile).
   * Not an external SPA. Commerce uses `/oms` instead.
   */
  expoProductShell?: boolean;
  /** Extra Expo paths that belong to this product surface (e.g. Invoice execute). */
  expoProductShellPaths?: readonly string[];
  /**
   * Product-owned module (readiness, routes, permissions).
   * Registered by each product app when it ships — not required for routing metadata alone.
   */
  module?: SuiteProductModule;
};

export const SUITE_PRODUCTS: Record<SuiteProductId, SuiteProductDefinition> = {
  core: {
    id: 'core',
    brandWord: PULSE_CORE_BRAND_WORD,
    name: 'Pulse Core',
    tagline: 'Transport operating system',
    appBasePath: '/',
    activationPath: ROUTES.ONBOARDING.BUSINESS,
    signUpRoute: ROUTES.ONBOARDING.BUSINESS,
  },
  pilot: {
    id: 'pilot',
    brandWord: PULSE_PILOT_BRAND_WORD,
    name: 'Pulse Pilot',
    tagline: 'Driver app',
    appBasePath: ROUTES.DRIVER_ROOT,
    activationPath: '/driver-signup',
    signUpRoute: '/driver-signup',
  },
  commerce: {
    id: 'commerce',
    brandWord: PULSE_COMMERCE_BRAND_WORD,
    name: 'Pulse Commerce',
    tagline: 'Catalog, inventory, orders & planning',
    appBasePath: '/oms',
    activationPath: '/oms/onboarding',
    signUpRoute: `${ROUTES.SIGN_UP}?product=commerce`,
  },
  invoice: {
    id: 'invoice',
    brandWord: PULSE_INVOICE_BRAND_WORD,
    name: 'Pulse Invoice',
    tagline: 'GST-compliant billing for this workspace',
    appBasePath: ROUTES.PULSE_INVOICE,
    activationPath: ROUTES.PULSE_INVOICE,
    signUpRoute: `${ROUTES.SIGN_UP}?product=invoice`,
    expoProductShell: true,
    expoProductShellPaths: [ROUTES.INVOICING_EXECUTE],
  },
  pod: {
    id: 'pod',
    brandWord: PULSE_POD_BRAND_WORD,
    name: 'Pulse POD',
    tagline: 'Proof of delivery capture and reconciliation',
    appBasePath: ROUTES.POD_RECONCILIATION,
    activationPath: ROUTES.POD_RECONCILIATION,
    signUpRoute: `${ROUTES.SIGN_UP}?product=pod`,
    expoProductShell: true,
  },
};

const SUITE_PRODUCT_IDS = new Set<string>(Object.keys(SUITE_PRODUCTS));

export function parseSuiteProductId(raw: string | string[] | undefined): SuiteProductId | null {
  const value = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : undefined;
  if (!value || !SUITE_PRODUCT_IDS.has(value)) return null;
  return value as SuiteProductId;
}

export function resolveSuiteProduct(productId: SuiteProductId | null | undefined): SuiteProductDefinition {
  return SUITE_PRODUCTS[productId ?? 'core'];
}

function pathMatchesPrefix(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

/** Expo product-shell path prefixes (Invoice, POD). Commerce `/oms` is not included. */
export function collectExpoProductShellPrefixes(): string[] {
  const prefixes: string[] = [];
  for (const product of Object.values(SUITE_PRODUCTS)) {
    if (!product.expoProductShell) continue;
    prefixes.push(product.appBasePath);
    for (const extra of product.expoProductShellPaths ?? []) {
      prefixes.push(extra);
    }
  }
  return prefixes;
}

export function pathnameUsesExpoProductShell(pathname: string): boolean {
  if (!pathname) return false;
  return collectExpoProductShellPrefixes().some((route) =>
    pathMatchesPrefix(pathname, route),
  );
}
