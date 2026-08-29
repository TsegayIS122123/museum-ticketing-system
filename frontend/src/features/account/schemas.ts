import { z } from 'zod';

// Phone number validation for Ethiopian format
const phoneRegex = /^(\+251|0)?[7-9][0-9]{8}$/;

export const visitorVerifyStartSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().regex(phoneRegex, 'Please enter a valid Ethiopian phone number (e.g., 0912345678)'),
  fullName: z.string().optional(),
  languagePreference: z.enum(['en', 'am']).optional().default('en'),
});

export const visitorVerifyConfirmSchema = z.object({
  verificationId: z.string().uuid('Invalid verification ID'),
  otpCode: z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must contain only digits'),
});

export const staffLoginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const staffForgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

export const staffResetPasswordSchema = z
  .object({
    token: z.string(),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type VisitorVerifyStartInput = z.infer<typeof visitorVerifyStartSchema>;
export type VisitorVerifyConfirmInput = z.infer<typeof visitorVerifyConfirmSchema>;
export type StaffLoginInput = z.infer<typeof staffLoginSchema>;
export type StaffForgotPasswordInput = z.infer<typeof staffForgotPasswordSchema>;
export type StaffResetPasswordInput = z.infer<typeof staffResetPasswordSchema>;
