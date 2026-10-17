import { z } from 'zod';

// Client-side shape/UX validation only. The real rules (password strength,
// email ownership, code expiry) are enforced by django-allauth
// (/_allauth/...) and surfaced back through headlessRequest as an ApiError,
// so nothing here needs to mirror AUTH_PASSWORD_VALIDATORS exactly.

export const signInSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Please enter your password'),
});

// One form for every role's self-registration (visitors self-serve; staff
// accounts are still created by a platform admin -- see platform_admin).
export const signUpSchema = z
  .object({
    email: z.string().email('Please enter a valid email address'),
    full_name: z.string().optional(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// The verification email carries a 6-digit code (ACCOUNT_EMAIL_VERIFICATION_
// BY_CODE_FORMAT) as well as a link; this validates the code path.
export const verifyEmailCodeSchema = z.object({
  code: z
    .string()
    .length(6, 'The code is 6 digits')
    .regex(/^\d{6}$/, 'The code must contain only digits'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

export const resetPasswordSchema = z
  .object({
    key: z.string(),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type VerifyEmailCodeInput = z.infer<typeof verifyEmailCodeSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
