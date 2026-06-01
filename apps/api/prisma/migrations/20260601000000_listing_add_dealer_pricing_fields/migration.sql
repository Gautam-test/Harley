-- Migration: add dealer-internal pricing fields to Listing
-- These four columns are optional (nullable) so existing rows stay valid
-- without a backfill. They are visible only on the dealer Add/Edit Listing
-- wizard — the buyer portal never reads or exposes them.

ALTER TABLE "Listing"
  ADD COLUMN IF NOT EXISTS "purchasePrice"      DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "refurbishmentPrice" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "ageingDays"         INTEGER,
  ADD COLUMN IF NOT EXISTS "finalSellingPrice"  DECIMAL(12,2);
