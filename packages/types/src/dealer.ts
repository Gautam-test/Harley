import { z } from 'zod';
import { phoneIN, pincodeIN } from './common.js';

export const dealerStatus = z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']);
export type DealerStatus = z.infer<typeof dealerStatus>;

export const adminCreateDealerInput = z.object({
  username: z.string().min(3).max(64).regex(/^[a-z0-9-]+$/i, 'Lowercase alphanumerics + hyphens only'),
  password: z.string().min(8).max(128).optional(), // omit to auto-generate
  name: z.string().min(2).max(120),
  legalName: z.string().max(200).optional(),
  email: z.string().email(),
  phone: phoneIN,
  address: z.string().max(300).optional(),
  city: z.string().min(1).max(100),
  state: z.string().max(100).optional(),
  pincode: pincodeIN,
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  // Empty string coerced to undefined so the unique constraint doesn't
  // trip when the admin leaves the optional Torque field blank (multiple
  // dealers having "" would all collide on the @unique index).
  torqueDealerId: z.string().max(100).optional().transform((v) => (v && v.trim() ? v.trim() : undefined)),
});
export type AdminCreateDealerInput = z.infer<typeof adminCreateDealerInput>;

export const adminUpdateDealerInput = adminCreateDealerInput
  .partial()
  .omit({ username: true, password: true });
export type AdminUpdateDealerInput = z.infer<typeof adminUpdateDealerInput>;

export const dealerPublic = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  pincode: pincodeIN,
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  phone: phoneIN.optional(), // gated until OTP verified
  email: z.string().email().optional(), // gated
});
export type DealerPublic = z.infer<typeof dealerPublic>;

export const nearestDealersQuery = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  // Cap at 5000 km so the home-page locator (centred at the India
  // centroid, lat 20.5937 lng 78.9629) can include every dealer in
  // the country. The 500 km cap missed Delhi / Mumbai / Bengaluru /
  // Chennai in a single sweep (QA bug 1).
  radius: z.coerce.number().min(1).max(5000).default(50),
});
export type NearestDealersQuery = z.infer<typeof nearestDealersQuery>;
