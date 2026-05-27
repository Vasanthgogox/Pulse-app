import { FinanceScreen } from '@/features/finance/components/FinanceScreen';

/**
 * Eager import — finance is ~3k modules. Lazy route + lazy sub-tabs caused Metro
 * "Requiring unknown module" on Expo Go; party lists rendered empty (headers only).
 */
export default function FinanceTab() {
  return <FinanceScreen />;
}
