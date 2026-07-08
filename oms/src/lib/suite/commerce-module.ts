import {
  evaluatePlatformAccessible,
  type ProductContext,
  type ProductReadiness,
  type SuiteProductModule,
} from '@pulse-suite/suiteProductModule';
import { PlatformReadinessService } from '@pulse-platform/index';

/** Commerce suite product module — delegates setup readiness to platform services. */
export const commerceModule: SuiteProductModule = {
  id: 'commerce',
  dashboardRoute: '/dashboard',
  onboardingRoute: '/onboarding',

  async evaluateReadiness(context: ProductContext): Promise<ProductReadiness> {
    const accessible = evaluatePlatformAccessible(context);
    if (!accessible || !context.workspaceId) {
      return { accessible, setupComplete: false };
    }

    const setup = await PlatformReadinessService.evaluate('commerce', context.workspaceId);
    return {
      accessible,
      setupComplete: setup.setupComplete,
      nextStep: setup.nextStep,
    };
  },
};
