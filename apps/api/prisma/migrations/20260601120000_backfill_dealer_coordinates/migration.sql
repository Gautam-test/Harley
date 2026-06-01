-- Backfill lat/lng for the known H-D dealer locations.
-- These values match the seed data in prisma/seed.ts and the static lookup
-- table in src/modules/listings/pincode-coords.ts.  Without this backfill,
-- the distance/radius filter in listings.routes.ts silently degrades to
-- "no results" because all dealers have NULL coordinates.
--
-- The UPDATE is keyed on the unique `pincode` column so it is idempotent and
-- only touches rows whose pincode matches a known entry.

UPDATE "Dealer" SET "latitude" = 28.4595, "longitude" = 77.0266 WHERE "pincode" = '122001' AND "latitude" IS NULL;
UPDATE "Dealer" SET "latitude" = 19.0596, "longitude" = 72.8295 WHERE "pincode" = '400050' AND "latitude" IS NULL;
UPDATE "Dealer" SET "latitude" = 18.5204, "longitude" = 73.8567 WHERE "pincode" = '411016' AND "latitude" IS NULL;
UPDATE "Dealer" SET "latitude" = 22.5726, "longitude" = 88.3639 WHERE "pincode" = '700016' AND "latitude" IS NULL;
UPDATE "Dealer" SET "latitude" = 30.7333, "longitude" = 76.7794 WHERE "pincode" = '160017' AND "latitude" IS NULL;
UPDATE "Dealer" SET "latitude" = 12.9716, "longitude" = 77.5946 WHERE "pincode" = '560025' AND "latitude" IS NULL;
UPDATE "Dealer" SET "latitude" = 17.3850, "longitude" = 78.4867 WHERE "pincode" = '500034' AND "latitude" IS NULL;
UPDATE "Dealer" SET "latitude" = 23.0225, "longitude" = 72.5714 WHERE "pincode" = '380009' AND "latitude" IS NULL;
UPDATE "Dealer" SET "latitude" = 26.8467, "longitude" = 80.9462 WHERE "pincode" = '226001' AND "latitude" IS NULL;
UPDATE "Dealer" SET "latitude" = 13.0827, "longitude" = 80.2707 WHERE "pincode" = '600018' AND "latitude" IS NULL;
