import { apiClient } from '@/api/client';
import { headlessRequest } from '@/api/headless';
import { authResponseSchema, headlessEnvelopeSchema } from '@/api/schemas';
import { useAuth } from '@/auth/useAuth';

// POST /_allauth/app/v1/auth/signup -- create an account (unified: any role,
// though self-registration only produces a visitor). Sends the verification
// email (6-digit code + link). Returns 401 with
// `data.flows[verify_email].is_pending` and a `meta.session_token` for a fresh
// account; that token must be replayed (X-Session-Token) to verifyEmail /
// resendVerificationEmail. A duplicate email returns the same shape
// (no account enumeration).
export async function signUp(input: {
  email: string;
  full_name?: string;
  password: string;
}) {
  const res = await headlessRequest<unknown>('/auth/signup', input);
  return headlessEnvelopeSchema.parse(res);
}

// POST /auth/login/ -- the single front-door sign-in for every role
// (FR-ACC-002, FR-ACC-005). Email + password only; the caller's `role` is
// returned on `user` and the client routes from there.
export async function login(input: { email: string; password: string }) {
  const res = await apiClient.post('/auth/login/', input);
  return authResponseSchema.parse(res.data);
}

// POST /_allauth/app/v1/auth/email/verify -- redeem the 6-digit code OR the
// link token from the verification email (`key` accepts either). Requires the
// flow's `sessionToken`. Returns 200 with `data.user` (and, for the app
// client, `meta.access_token` / `meta.refresh_token`) on success.
export async function verifyEmail(input: { key: string; sessionToken: string }) {
  const res = await headlessRequest<unknown>(
    '/auth/email/verify',
    { key: input.key },
    { sessionToken: input.sessionToken }
  );
  return headlessEnvelopeSchema.parse(res);
}

// POST /_allauth/app/v1/auth/email/verify/resend -- re-send the verification
// email/code for the pending flow. Takes no JSON body (allauth resumes the
// EmailVerificationProcess from the session/stage), only the `sessionToken`.
export async function resendVerificationEmail(sessionToken: string) {
  const res = await headlessRequest<unknown>(
    '/auth/email/verify/resend',
    undefined,
    { sessionToken }
  );
  return headlessEnvelopeSchema.parse(res);
}

export function useAuthActions() {
  const { signIn, signOut } = useAuth();
  return { signIn, signOut };
}
