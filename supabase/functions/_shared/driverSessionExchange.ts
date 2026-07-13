/** Exchange admin.generateLink hashed token for a Supabase session. */
export type DriverSessionTokens = {
  access_token: string;
  refresh_token: string;
};

type AuthVerifyClient = {
  auth: {
    verifyOtp: (params: Record<string, string>) => Promise<{
      data: { session?: { access_token?: string; refresh_token?: string } | null } | null;
      error: { message?: string } | null;
    }>;
  };
};

type GenerateLinkClient = {
  auth: {
    admin: {
      generateLink: (args: {
        type: 'magiclink';
        email: string;
      }) => Promise<{
        data: {
          properties?: {
            hashed_token?: string;
            email_otp?: string;
          };
        } | null;
        error: { message?: string } | null;
      }>;
    };
  };
};

export type ExchangeMagicLinkOptions = {
  /**
   * Prefer the anon/publishable client for verifyOtp — service-role verifyOtp is
   * unreliable on many projects (empty session / AuthRetryableFetchError).
   */
  verifyClient?: AuthVerifyClient;
};

export async function exchangeMagicLinkForSession(
  admin: GenerateLinkClient,
  email: string,
  logPrefix: string,
  options?: ExchangeMagicLinkOptions,
): Promise<DriverSessionTokens | null> {
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError) {
    console.warn(`[${logPrefix}] generateLink failed:`, linkError.message);
    return null;
  }

  const hashedToken = linkData?.properties?.hashed_token?.trim() ?? '';
  const emailOtp = linkData?.properties?.email_otp?.trim() ?? '';
  if (!hashedToken && !emailOtp) {
    console.warn(`[${logPrefix}] generateLink returned no hashed_token or email_otp`);
    return null;
  }

  const verifyClient = options?.verifyClient ?? (admin as unknown as AuthVerifyClient);
  const verifyAttempts: Array<Record<string, string>> = [];
  if (hashedToken) {
    verifyAttempts.push(
      { token_hash: hashedToken, type: 'email' },
      { token_hash: hashedToken, type: 'magiclink' },
    );
  }
  if (emailOtp) {
    verifyAttempts.push(
      { email, token: emailOtp, type: 'email' },
      { email, token: emailOtp, type: 'magiclink' },
    );
  }

  for (const params of verifyAttempts) {
    const label = params.token_hash ? `token_hash/${params.type}` : `email_otp/${params.type}`;
    const { data, error } = await verifyClient.auth.verifyOtp(params);
    const accessToken = data?.session?.access_token;
    const refreshToken = data?.session?.refresh_token;
    if (!error && accessToken && refreshToken) {
      return { access_token: accessToken, refresh_token: refreshToken };
    }
    if (error) {
      console.warn(`[${logPrefix}] verifyOtp ${label} failed:`, error.message);
    } else {
      console.warn(`[${logPrefix}] verifyOtp ${label} returned no session`);
    }
  }

  return null;
}

/** Fallback for clients that exchange the hashed token themselves. */
export async function generateDriverMagicLinkToken(
  admin: GenerateLinkClient,
  email: string,
  logPrefix: string,
): Promise<string | null> {
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError || !linkData?.properties?.hashed_token) {
    console.warn(`[${logPrefix}] generateLink (token only) failed:`, linkError?.message);
    return null;
  }
  return linkData.properties.hashed_token;
}
