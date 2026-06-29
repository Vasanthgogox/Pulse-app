// Backward-compat shim — AdminDataProvider is now the source of truth
export { AdminDataProvider as KycDataProvider, useAdmin as useKyc } from './AdminDataProvider';
