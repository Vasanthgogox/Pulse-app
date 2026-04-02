/** Shared close behavior for add-driver modal: go back when possible. */
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

export function closeModal(router: ReturnType<typeof useRouter>) {
  if (router.canGoBack()) router.back();
  else router.replace("/(tabs)/finance");
}

export default function AddDriverCloseModal() {
  const router = useRouter();
  useEffect(() => {
    closeModal(router);
  }, [router]);
  return null;
}
