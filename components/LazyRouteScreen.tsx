import { AppLoadingSplash } from '@/components/AppLoadingSplash';
import { lazy, Suspense, useRef, type ComponentType } from 'react';
import { StyleSheet } from 'react-native';

type LazyRouteScreenProps = {
  loader: () => Promise<{ default: ComponentType<object> }>;
  message?: string;
};

/**
 * Shows branded splash while Metro downloads a lazy route chunk.
 * Use on tab/stack entries instead of `export { default } from './heavy-screen'`.
 */
export function LazyRouteScreen({ loader, message }: LazyRouteScreenProps) {
  const screenRef = useRef<ComponentType<object> | null>(null);
  if (!screenRef.current) screenRef.current = lazy(loader);
  const Screen = screenRef.current;
  return (
    <Suspense
      fallback={
        <AppLoadingSplash variant="preparing" message={message} style={styles.fallback} />
      }
    >
      <Screen />
    </Suspense>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
  },
});
