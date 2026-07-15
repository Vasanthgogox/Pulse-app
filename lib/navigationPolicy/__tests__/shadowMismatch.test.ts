import {
  clearShadowObservations,
  getShadowMismatchReport,
  recordShadowDecision,
  settleShadowIfStable,
  settleShadowPath,
} from '@/lib/navigationPolicy/shadowMismatch';
import { authStatusToSessionPosture } from '@/lib/navigationPolicy/sessionPosture';
import { SIGN_IN_PATH } from '@/lib/navigationPolicy/types';

describe('authStatusToSessionPosture', () => {
  it('maps AuthStatus correctly', () => {
    expect(authStatusToSessionPosture('restoring')).toBe('restoring');
    expect(authStatusToSessionPosture('unauthenticated')).toBe('anonymous');
    expect(authStatusToSessionPosture('authenticated')).toBe('authenticated');
    expect(authStatusToSessionPosture('expired')).toBe('expired');
  });
});

describe('shadowMismatch', () => {
  beforeEach(() => {
    clearShadowObservations();
  });

  it('records expectedRedirect from policy redirect decisions', () => {
    recordShadowDecision({
      pathname: '/workspace',
      canonicalPath: '/workspace',
      decision: {
        type: 'redirect',
        to: SIGN_IN_PATH,
        reason: 'anonymous_protected',
        replace: true,
      },
      reason: 'anonymous_protected',
    });
    settleShadowIfStable('/workspace');
    const report = getShadowMismatchReport();
    expect(report.totalObservations).toBe(1);
    expect(report.settledCount).toBe(1);
    expect(report.mismatches[0]?.mismatch).toBe('policy_redirect_legacy_stayed');
    expect(report.mismatches[0]?.expectedRedirect).toBe(SIGN_IN_PATH);
    expect(report.mismatches[0]?.currentRedirect).toBe('/workspace');
  });

  it('no mismatch when legacy lands on expected redirect', () => {
    recordShadowDecision({
      pathname: '/workspace',
      canonicalPath: '/workspace',
      decision: {
        type: 'redirect',
        to: SIGN_IN_PATH,
        reason: 'anonymous_protected',
        replace: true,
      },
      reason: 'anonymous_protected',
    });
    settleShadowPath(SIGN_IN_PATH);
    const report = getShadowMismatchReport();
    expect(report.mismatchCount).toBe(0);
    expect(report.byKind.none).toBe(1);
  });

  it('flags policy_allow_legacy_left when allow then bounce to sign-in', () => {
    recordShadowDecision({
      pathname: '/trips',
      canonicalPath: '/trips',
      decision: { type: 'allow', policyId: 'org.trips', reason: 'policy_allow' },
      reason: 'policy_allow',
    });
    settleShadowPath(SIGN_IN_PATH);
    const report = getShadowMismatchReport();
    expect(report.mismatchCount).toBe(1);
    expect(report.mismatches[0]?.mismatch).toBe('policy_allow_legacy_left');
  });

  it('in-app navigation after allow is not a mismatch', () => {
    recordShadowDecision({
      pathname: '/trips',
      canonicalPath: '/trips',
      decision: { type: 'allow', policyId: 'org.trips', reason: 'policy_allow' },
      reason: 'policy_allow',
    });
    settleShadowPath('/trip/abc');
    expect(getShadowMismatchReport().mismatchCount).toBe(0);
  });
});
