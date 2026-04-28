/**
 * Test data factory.
 * All generated data is deterministic-per-run but unique across parallel workers
 * thanks to timestamp + random suffix. Emails use the `@pulse-e2e.dev` domain so
 * global teardown can sweep them up by pattern.
 */

export interface TestUserData {
  email: string;
  password: string;
  phone: string;         // 10-digit Indian mobile, e.g. "9876543210"
  phoneFormatted: string; // UI display form: "987 654 3210"
  fullName: string;
  companyName: string;
  city: string;
  state: string;
  zone: string;
  role: 'user' | 'driver';
}

/**
 * Generates a random valid Indian 10-digit mobile number.
 * Indian mobiles start with 6, 7, 8, or 9 and are exactly 10 digits.
 */
function randomIndianPhone(): string {
  const firstDigit = String([6, 7, 8, 9][Math.floor(Math.random() * 4)]);
  const rest = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
  return firstDigit + rest;
}

/** Formats a 10-digit phone as "XXX XXX XXXX" matching the UI's formatMobileNumber output. */
function formatPhone(phone: string): string {
  return `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}`;
}

function uniqueSuffix(): string {
  // timestamp (ms) + 4 random hex chars → effectively collision-free across parallel workers
  return `${Date.now()}${Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, '0')}`;
}

function randomCompanyName(suffix: string): string {
  const prefixes = ['Cargo', 'Rapid', 'Fleet', 'Trans', 'Move', 'Swift', 'Prime', 'Eagle'];
  const pick = prefixes[Math.floor(Math.random() * prefixes.length)];
  return `${pick} Logistics ${suffix}`;
}

function randomFullName(): string {
  const first = ['Arjun', 'Priya', 'Rahul', 'Meena', 'Vikram', 'Deepa', 'Nikhil', 'Ananya'];
  const last = ['Sharma', 'Patel', 'Singh', 'Reddy', 'Kumar', 'Nair', 'Mehta', 'Joshi'];
  return `${first[Math.floor(Math.random() * first.length)]} ${last[Math.floor(Math.random() * last.length)]}`;
}

/**
 * Generates test data for a dispatcher / business user (role = 'user').
 * City is fixed as Mumbai so tests can rely on known state/zone values.
 */
export function generateTestUser(): TestUserData {
  const suffix = uniqueSuffix();
  const phone = randomIndianPhone();
  return {
    email: `test+${suffix}@pulse-e2e.dev`,
    password: `TestPass_${suffix.slice(-6)}!`,
    phone,
    phoneFormatted: formatPhone(phone),
    fullName: randomFullName(),
    companyName: randomCompanyName(suffix.slice(-6)),
    city: 'Mumbai',
    state: 'Maharashtra',
    zone: 'WEST',
    role: 'user',
  };
}

/**
 * Generates test data for a driver user (role = 'driver').
 * Drivers do not own organizations so city/state/zone are still generated
 * but will not be used in org assertions.
 */
export function generateDriverUser(): TestUserData {
  const base = generateTestUser();
  return {
    ...base,
    email: base.email.replace('test+', 'test+drv'),
    companyName: `Driver Co ${uniqueSuffix().slice(-6)}`,
    role: 'driver',
  };
}
