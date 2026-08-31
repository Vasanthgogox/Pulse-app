import { useState, type FormEvent } from "react";
import { Loader2, Shield } from "lucide-react";
import { supabaseAuth } from "@/lib/supabaseAuth";
import { Button } from "@/components/ui/button";

/**
 * Sign-in only, deliberately no sign-up form — see docs/SUPPORT_S3A_IMPLEMENTATION_PLAN.md §4.
 * The project's [auth.email] enable_signup=true is a pre-existing, unrelated setting for the main
 * consumer app; this screen must not expose a self-registration path into auth.users.
 *
 * Google is the primary path: the bootstrap identity (and most Pulse staff accounts) only ever
 * authenticated via Google OAuth in the main app, never set a password. Email/password stays
 * available for any admin who does have one, same underlying signInWithOAuth/signInWithPassword
 * primitives the main app already uses (features/auth/services/auth.service.ts).
 */
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.58-5.17 3.58-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.08.72-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.61H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.39l4-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.61l4 3.11C6.22 6.88 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}

export function AdminLoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: signInError } = await supabaseAuth.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (signInError) setError(signInError.message);
  }

  async function handleGoogleSignIn() {
    setError(null);
    setGoogleBusy(true);
    const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
    const { error: oauthError } = await supabaseAuth.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    // On success, Supabase performs a full-page redirect to Google immediately — control never
    // returns here. This only runs if the redirect itself couldn't be started.
    if (oauthError) {
      setGoogleBusy(false);
      setError(oauthError.message);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Shield className="size-4 text-primary" />
          <h1 className="text-sm font-bold">Admin Console — sign in</h1>
        </div>

        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full"
          disabled={googleBusy}
          onClick={() => void handleGoogleSignIn()}
        >
          {googleBusy ? <Loader2 className="size-4 animate-spin" /> : <GoogleGlyph />}
          Continue with Google
        </Button>

        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="admin-email">
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="admin-password">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}

          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
