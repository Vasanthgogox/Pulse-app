import { isUrlAllowed } from '@/constants/AllowedUrls';
import { Link } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { Platform } from 'react-native';

export function ExternalLink(
  props: Omit<React.ComponentProps<typeof Link>, 'href'> & { href: string }
) {
  const href = props.href ?? '';
  const allowed = isUrlAllowed(href);

  return (
    <Link
      target="_blank"
      {...props}
       
      href={href as never}
      onPress={(e) => {
        if (Platform.OS !== 'web') {
          e.preventDefault();
          if (allowed) {
            WebBrowser.openBrowserAsync(href);
          }
          // If not allowed, no-op (security: no user-controlled or unallowlisted URLs)
        }
      }}
    />
  );
}
