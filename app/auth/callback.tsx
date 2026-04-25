import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import Theme from "@/constants/Theme";
import * as authService from "@/features/auth";
import { supabase } from "@/lib/supabase";
import { ROUTES } from "@/lib/routes";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert } from "react-native";

export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string | string[];
    error?: string | string[];
    error_description?: string | string[];
  }>();
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
    let mounted = true;

    const pickFirst = (v: string | string[] | undefined): string | undefined => {
      if (typeof v === "string") return v;
      if (Array.isArray(v) && typeof v[0] === "string") return v[0];
      return undefined;
    };

    (async () => {
      try {
        const err =
          pickFirst(params.error_description) ?? pickFirst(params.error) ?? undefined;
        if (err) throw new Error(err);

        const code = pickFirst(params.code);
        if (!code) throw new Error("Missing auth code from Google");

        setMessage("Finishing sign in…");
        const { error } = await supabase().auth.exchangeCodeForSession(code);
        if (error) throw new Error(error.message || "Google sign in failed");

        // Ensure any pending metadata (role/operatingModel) is applied.
        await authService.applyPendingOAuthMetadata();

        // AuthContext + app/index.tsx handles routing based on role.
        if (mounted) router.replace("/");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Google sign in failed";
        if (mounted) {
          Alert.alert("Sign in failed", msg);
          router.replace(ROUTES.SIGN_IN_DIRECT);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [params.code, params.error, params.error_description, router]);

  return <CenteredLoadingView message={message} color={Theme.primary} />;
}

