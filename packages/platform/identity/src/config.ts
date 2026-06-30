import type { PlatformJwtClaims } from '@pulse/contracts';

export interface AuthContext {
  /** Supabase auth user id */
  authUserId?:     string;
  email?:          string;
  platformClaims?: PlatformJwtClaims;
  requestId:       string;
}

export interface IdentityConfig {
  supabaseUrl:        string;
  supabaseServiceKey: string;
  supabaseAnonKey:    string;
  jwtSecret:          string;
  jwtIssuer?:         string;
  jwtAudience?:       string;
  serviceVersion:     string;
  gitCommit?:         string;
}
