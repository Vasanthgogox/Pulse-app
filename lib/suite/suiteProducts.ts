import { ROUTES } from '@/lib/routes';
import {
  PULSE_COMMERCE_BRAND_WORD,
  PULSE_CORE_BRAND_WORD,
  PULSE_PILOT_BRAND_WORD,
} from '@/lib/brand/pulseBrandMark.tokens';

/** Suite products — shared Pulse Identity, separate apps (Zoho-style). */
export type SuiteProductId = 'core' | 'pilot' | 'commerce';

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
