import { z } from 'zod';

export const phoneIN = z
  .string()
  .regex(/^\+91[0-9]{10}$/, 'Phone must be +91 followed by 10 digits');

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
