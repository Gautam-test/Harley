-- Add optional `owners` count to Listing.
-- Nullable so existing rows pre-migration stay valid; new dealer wizard
-- creates always provide it.
ALTER TABLE "Listing" ADD COLUMN "owners" INTEGER;
