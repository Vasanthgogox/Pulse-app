import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import Theme from "@/constants/Theme";
import * as authService from "@/features/auth";
import { supabase } from "@/lib/supabase";
import { ROUTES } from "@/lib/routes";
import { Redirect, useLocalSearchParams, useRootNavigationState } from "expo-router";
import { useEffect, useState } from "react";

export default function AuthCallback() {
  const rootNavigationState = useRootNavigationState();
  const params = useLocalSearchParams<{
    code?: string | string[];
    error?: string | string[];
    error_description?: string | string[];
  }>();
  const [message, setMessage] = useState("Signing you in…");
  const [redirectTo, setRedirectTo] = useState<string | null>(null);

  useEffect(() => {
    if (!rootNavigationState?.key) return;
    let mounted = true;

    const pickFirst = (v: string | string[] | undefined): string | undefined => {
      if (typeof v === "string") return v;
      if (Array.isArray(v) && typeof v[0] === "string") return v[0];
      return undefined;
    };

    const pickFromHash = (key: string): string | undefined => {
      if (typeof window === "undefined") return undefined;
      const hash = window.location.hash?.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      if (!hash) return undefined;
      const params = new URLSearchParams(hash);
      const v = params.get(key);
      return v ?? undefined;
    };

    (async () => {
      try {
        const err =
          pickFirst(params.error_description) ?? pickFirst(params.error) ?? undefined;
        if (err) throw new Error(err);

        setMessage("Finishing sign in…");
        const code = pickFirst(params.code);
        if (code) {
          const { error } = await supabase().auth.exchangeCodeForSession(code);
          if (error) throw new Error(error.message || "Google sign in failed");
        } else {
          // Some providers/configs return implicit tokens in URL hash instead of auth code.
          const accessToken = pickFromHash("access_token");
          const refreshToken = pickFromHash("refresh_token");
          if (!accessToken || !refreshToken) {
            throw new Error("Missing auth code/token from Google");
          }
          const { error } = await supabase().auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw new Error(error.message || "Google sign in failed");
        }

        // Ensure any pending metadata (role/operatingModel) is applied.
        await authService.applyPendingOAuthMetadata();

        // Clean auth params from URL after successful callback.
        if (typeof window !== "undefined" && window.history?.replaceState) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        // Go directly to app entry; AuthGuard routes user without extra hop.
        if (mounted) {
          setMessage("Sign in successful. Redirecting to workspace…");
          setRedirectTo(ROUTES.INDEX);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Google sign in failed";
        if (mounted) {
          setMessage("Google sign in failed. Redirecting to sign in…");
          setRedirectTo(`${ROUTES.SIGN_IN_DIRECT}&oauth_error=${encodeURIComponent(msg)}`);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [params.code, params.error, params.error_description, rootNavigationState?.key]);

  if (rootNavigationState?.key && redirectTo) {
    return <Redirect href={redirectTo} />;
  }

  return <CenteredLoadingView message={message} color={Theme.primary} />;
}

