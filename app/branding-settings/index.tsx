/**
 * @deprecated Route migrated to workspace settings.
 * This shim silently redirects any existing deep-links or bookmarks.
 */
import { ROUTES } from "@/lib/routes";
import { Redirect } from 'expo-router';

export default function BrandingSettingsRedirect() {
  return <Redirect href={ROUTES.WORKSPACE_SETTINGS as never} />;
}
