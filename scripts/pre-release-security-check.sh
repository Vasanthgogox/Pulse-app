#!/bin/bash
# Pre-release security gates. Run before cutting a release.
# CI runs equivalent checks in .github/workflows/security.yml
set -e
echo "Running security gates..."

echo "[1/2] npm audit (fail on high or critical)..."
npm audit --audit-level=high

echo "[2/2] Example env files (no JWT/secrets)..."
./scripts/check-env-example-no-secrets.sh

echo "[3/3] Secret scan (TruffleHog)..."
if command -v trufflehog &>/dev/null; then
  trufflehog filesystem . --no-verification
else
  echo "  (trufflehog not in PATH; skipped. CI will run it. Install: https://github.com/trufflesecurity/trufflehog)"
fi

echo "All checks passed!"
