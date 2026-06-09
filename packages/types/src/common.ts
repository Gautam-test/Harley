import { z } from 'zod';

// BUG-058: Indian mobile numbers must start with 6, 7, 8, or 9. The
// previous regex accepted any 10-digit sequence (including 0-5 start
// which is reserved for landline / service codes) — leading to invalid
// numbers slipping into dealer + buyer + seller records. Message is
// the spec-mandated copy so the frontend can render it verbatim.
export const phoneIN = z
  .string()
  .regex(
    /^\+91[6-9][0-9]{9}$/,
    'Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.',
  );

export const pincodeIN = z.string().regex(/^[0-9]{6}$/, 'Pincode must be 6 digits');

export const emailSchema = z.string().email();

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(12),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

export const apiError = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});
export type ApiError = z.infer<typeof apiError>;
