/**
 * @deprecated Route migrated to /workspace.
 * This shim silently redirects any existing deep-links or bookmarks.
 */
import { Redirect } from 'expo-router';

export default function BrandingSettingsRedirect() {
  return <Redirect href="/workspace" />;
}
