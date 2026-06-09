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

// Indian PIN codes always start 1-9 (region 0 doesn't exist in the postal
// system). Rejects "000000" and other zero-prefixed inputs — matches the
// frontend PINCODE_REGEX, so a curl bypass can't slip an invalid pincode
// through the API. Surfaced during BUG-053/055 retest pass.
export const pincodeIN = z
  .string()
  .regex(/^[1-9][0-9]{5}$/, 'Pincode must be 6 digits and cannot start with 0');

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
