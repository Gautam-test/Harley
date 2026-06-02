ALTER TABLE "Listing"
  ADD COLUMN IF NOT EXISTS "registrationNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "inspectedBy"        TEXT,
  ADD COLUMN IF NOT EXISTS "certifiedOn"        TIMESTAMPTZ;
