import fs from 'fs';
import path from 'path';

/**
 * Ban session/role/onboarding router.replace outside NavigationActor.
 * Scans layout gates + boot index (not feature CTAs like “Sign in” buttons).
 */

const ROOT = path.join(__dirname, '../../../');

const GATE_FILES = [
  'app/index.tsx',
  'app/(tabs)/_layout.tsx',
  'app/(driver)/_layout.tsx',
  'app/pulse-loads/_layout.tsx',
];

/** Still allowed in these layouts (non–auth-gate). */
const ALLOWED_LINE =
  /TABS\.NETWORK|saveLastTab|loadCenter|PULSE_LOADS|navigation\.navigate/;

const FORBIDDEN =
  /router\.replace\s*\(\s*(?:ROUTES\.(?:SIGN_IN|SIGN_IN_DIRECT|DRIVER_ROOT|ONBOARDING)|['"`]\/(?:sign-in|driver-signup|onboarding))/;

describe('CI: ban auth router.replace in layout/boot gates', () => {
  it('layouts + index have no session/onboarding replace (Actor owns them)', () => {
    const offenders: { file: string; line: string }[] = [];
    for (const rel of GATE_FILES) {
      const abs = path.join(ROOT, rel);
      if (!fs.existsSync(abs)) continue;
      const lines = fs.readFileSync(abs, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!FORBIDDEN.test(line)) return;
        if (ALLOWED_LINE.test(line)) return;
        // index boot destinations (driver home / last tab) are allowed
        if (
          rel === 'app/index.tsx' &&
          (/DEFAULT_DRIVER_ROUTE|getLastTabRoute|navigateAfterSuiteAuth/.test(
            line,
          ) ||
            /route as/.test(line))
        ) {
          return;
        }
        offenders.push({ file: `${rel}:${i + 1}`, line: line.trim() });
      });
    }
    // Also forbid leftover trip web session gate
    const tripWeb = path.join(ROOT, 'app/trip/[id]/index.web.tsx');
    if (fs.existsSync(tripWeb)) {
      const text = fs.readFileSync(tripWeb, 'utf8');
      if (/SIGN_IN|router\.replace/.test(text) && /useAuth/.test(text)) {
        offenders.push({
          file: 'app/trip/[id]/index.web.tsx',
          line: 'session gate must remain removed',
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
