/**
 * Shared email validation for forms (sign-up, driver sign-up, Add Driver, etc.).
 * Format: local-part @ gmail.com only; max length 255.
 */

const MAX_EMAIL_LENGTH = 255;
const ALLOWED_DOMAIN = 'gmail.com';

/** Basic format: something @ something . something (no spaces, has @ and dot in domain). */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates an email address string. Only @gmail.com addresses are accepted.
 * @param email - Raw input (trimmed internally).
 * @returns Error message if invalid, or null if valid.
 */
export function validateEmail(email: string): string | null {
  const trimmed = (email ?? '').trim();
  if (trimmed.length === 0) return null;

  if (trimmed.length > MAX_EMAIL_LENGTH) {
    return `Email must be at most ${MAX_EMAIL_LENGTH} characters.`;
  }
  if (!EMAIL_REGEX.test(trimmed)) {
    return 'Enter a valid email address (e.g. you@gmail.com).';
  }
  const domain = trimmed.slice(trimmed.indexOf('@') + 1).toLowerCase();
  if (domain !== ALLOWED_DOMAIN) {
    return 'Only Gmail addresses are allowed (e.g. you@gmail.com).';
  }
  return null;
}

/**
 * Returns true if the email string is valid (or empty). Use for optional email fields.
 */
export function isEmailValid(email: string): boolean {
  const trimmed = (email ?? '').trim();
  if (trimmed.length === 0) return true;
  return validateEmail(email) === null;
}
