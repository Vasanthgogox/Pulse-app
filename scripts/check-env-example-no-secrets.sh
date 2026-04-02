#!/bin/bash
# Fail if .env.example or .env.local.example contain values that look like real secrets
# (e.g. JWT, base64 keys). Use placeholders only in committed example files.
set -e
FAILED=0

# JWT pattern: eyJ... (header). Real anon keys are JWTs.
JWT_PATTERN='eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*'

for file in .env.example .env.local.example; do
  if [ ! -f "$file" ]; then continue; fi
  if grep -qE "$JWT_PATTERN" "$file" 2>/dev/null; then
    echo "ERROR: $file contains a JWT-like value (possible real secret). Use a placeholder (e.g. your-anon-key)."
    FAILED=1
  fi
  # Optional: reject long base64-ish lines that might be keys
  if grep -E '^[A-Za-z0-9+/=]{80,}$' "$file" 2>/dev/null | grep -v '^#'; then
    echo "WARN: $file contains a long base64-like line. Ensure it is a placeholder."
  fi
done

if [ $FAILED -eq 1 ]; then
  exit 1
fi
echo "check-env-example-no-secrets: OK (no JWT-like values in example files)"
exit 0
