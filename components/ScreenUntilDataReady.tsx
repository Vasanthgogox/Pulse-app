import {
  AppLoadingSplash,
  type AppLoadingSplashProps,
} from '@/components/AppLoadingSplash';
import type { ReactNode } from 'react';

export type ScreenUntilDataReadyProps = AppLoadingSplashProps & {
  loading: boolean;
  children: ReactNode;
};

/** Full-screen calm splash until `loading` is false, then renders children. */
export function ScreenUntilDataReady({
  loading,
  children,
  ...splashProps
}: ScreenUntilDataReadyProps) {
  if (loading) {
    return <AppLoadingSplash {...splashProps} />;
  }
  return <>{children}</>;
}
