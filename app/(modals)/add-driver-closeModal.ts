/** Shared close behavior for add-driver modal: dismiss when possible, else Network (drivers live there — not Resources/More). */
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ROUTES } from '@/lib/routes';

const FALLBACK_AFTER_ADD_DRIVER = ROUTES.TABS.NETWORK;

export function closeModal(router: ReturnType<typeof useRouter>) {
  if (typeof router.dismiss === 'function') {
    router.dismiss();
    return;
  }
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
