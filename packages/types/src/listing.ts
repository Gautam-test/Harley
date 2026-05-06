import { z } from 'zod';

// VIN: 17 chars, uppercase alphanumeric, no I/O/Q (PRD §6.2.3 AC1).
export const vin = z
  .string()
  .length(17)
  .regex(/^[A-HJ-NPR-Z0-9]{17}$/, 'Invalid VIN (17 chars, no I/O/Q)');

export const certStatus = z.enum(['CPO', 'AS_IS']);
export type CertStatus = z.infer<typeof certStatus>;

export const listingStatus = z.enum(['DRAFT', 'ACTIVE', 'SOLD', 'REMOVED', 'DEACTIVATED']);
export type ListingStatus = z.infer<typeof listingStatus>;

export const sortBy = z.enum(['newest', 'priceAsc', 'priceDesc', 'kmsAsc']);

export const listingSearchQuery = z.object({
  modelFamily: z.string().optional(),
  model: z.string().optional(),
  pincode: z.string().regex(/^[0-9]{6}$/).optional(),
  distance: z.coerce.number().min(1).max(500).optional(),
  maxPrice: z.coerce.number().positive().optional(),
  minYear: z.coerce.number().int().optional(),
  maxYear: z.coerce.number().int().optional(),
  minKms: z.coerce.number().int().min(0).optional(),
  maxKms: z.coerce.number().int().min(0).optional(),
  colour: z.string().optional(),
  cert: certStatus.optional(),
  sort: sortBy.default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});
export type ListingSearchQuery = z.infer<typeof listingSearchQuery>;

export const listingCard = z.object({
  id: z.string(),
  slug: z.string(),
  vin: z.string(),
  modelFamily: z.string(),
  modelName: z.string(),
  year: z.number().int(),
  colour: z.string(),
  price: z.number(),
  kmsDriven: z.number().int(),
  primaryImage: z.string(),
  certificationStatus: certStatus,
  dealerName: z.string(),
  city: z.string(),
});
export type ListingCard = z.infer<typeof listingCard>;

export const listingDetail = listingCard.extend({
  description: z.string(),
  images: z.array(z.string()),
  inspectionReportUrl: z.string().nullable(),
  cpoDocs: z.record(z.string()).nullable(),
  publishedAt: z.string().nullable(),
  dealerId: z.string(),
  /** Number of previous owners. Null when not captured (legacy listings). */
  owners: z.number().int().min(1).max(20).nullable(),
});
export type ListingDetail = z.infer<typeof listingDetail>;

export const listingSearchResponse = z.object({
  results: z.array(listingCard),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type ListingSearchResponse = z.infer<typeof listingSearchResponse>;

// ─── Dealer-scoped operations ──────────────────────────────────────────────

// Vehicle facts (modelFamily, modelName, colour, year) are intentionally
// NOT in the create input — the server reads them from Torque DMS via the
// VIN to prevent client-side spoofing. Year is derived from the VIN's 10th
// character (industry-standard model-year code).
export const createListingInput = z.object({
  vin,
  price: z.number().positive(),
  kmsDriven: z.number().int().min(0),
  /** Number of previous owners — required by Figma Add-Listing form. */
  owners: z.number().int().min(1).max(20),
  description: z.string().min(20).max(5000),
  images: z.array(z.string()).min(5).max(20),
  inspectionReportUrl: z.string().nullable(),
  certificationStatus: certStatus,
  cpoDocs: z.record(z.string()).optional(),
});
export type CreateListingInput = z.infer<typeof createListingInput>;

// Edit must respect the same minimum-image rule as create — without this
// floor a dealer could publish a 5-image listing and then PATCH it down to
// one photo, fully bypassing the 5-photo product rule.
//
// VIN, modelFamily, modelName, year and colour are read-only after creation
// (they come from Torque DMS — the dealer can't dispute the source of truth)
// so they're absent from this schema. Everything else the wizard renders
// post-creation is editable here. `inspectionReportUrl` accepts null so a
// dealer flipping CPO → AS_IS can clear the inspection PDF in the same call.
export const updateListingInput = z.object({
  price: z.number().positive().optional(),
  kmsDriven: z.number().int().min(0).optional(),
  /** Number of previous owners — same range as create (1..20). */
  owners: z.number().int().min(1).max(20).optional(),
  description: z.string().min(20).max(5000).optional(),
  images: z.array(z.string()).min(5).max(20).optional(),
  certificationStatus: certStatus.optional(),
  inspectionReportUrl: z.string().nullable().optional(),
  cpoDocs: z.record(z.string()).nullable().optional(),
});
export type UpdateListingInput = z.infer<typeof updateListingInput>;

export const dealerListingRow = z.object({
  id: z.string(),
  vin: z.string(),
  slug: z.string(),
  modelName: z.string(),
  year: z.number().int(),
  price: z.number(),
  kmsDriven: z.number().int(),
  certificationStatus: certStatus,
  status: listingStatus,
  primaryImage: z.string().nullable(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type DealerListingRow = z.infer<typeof dealerListingRow>;
