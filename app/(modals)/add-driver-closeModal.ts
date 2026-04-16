/** Shared close behavior for add-driver modal: dismiss when possible, else Network (drivers live there — not Resources/More). */
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

const FALLBACK_AFTER_ADD_DRIVER = "/(tabs)/network" as const;

export function closeModal(router: ReturnType<typeof useRouter>) {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(FALLBACK_AFTER_ADD_DRIVER);
  }
}

export default function AddDriverCloseModal() {
  const router = useRouter();
  useEffect(() => {
    closeModal(router);
  }, [router]);
  return null;
}
