import { z } from 'zod';
import { phoneIN } from './common.js';

export const otpPurpose = z.enum(['ENQUIRY', 'GENERAL_LEAD', 'TRADE_IN']);
export type OtpPurpose = z.infer<typeof otpPurpose>;

export const otpSendInput = z.object({
  phone: phoneIN,
  purpose: otpPurpose,
});
export type OtpSendInput = z.infer<typeof otpSendInput>;

export const otpSendResponse = z.object({
  otpId: z.string(),
  expiresInSeconds: z.number().int().positive(),
});
export type OtpSendResponse = z.infer<typeof otpSendResponse>;

export const otpVerifyInput = z.object({
  otpId: z.string(),
  code: z.string().regex(/^[0-9]{6}$/, 'OTP must be 6 digits'),
});
export type OtpVerifyInput = z.infer<typeof otpVerifyInput>;

export const otpVerifyResponse = z.object({
  verifiedToken: z.string(),
});
export type OtpVerifyResponse = z.infer<typeof otpVerifyResponse>;
