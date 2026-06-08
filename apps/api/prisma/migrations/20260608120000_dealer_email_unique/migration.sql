-- BUG-051: enforce dealer email uniqueness at the database layer so a
-- second admin (or a direct DB insert / import script) cannot create
-- a duplicate dealer with the same email. Pairs with the service-layer
-- pre-check in adminCreateDealer / adminUpdateDealer that returns the
-- spec-mandated friendly error to the admin UI.
--
-- Pre-flight: normalise existing emails to lowercase so the unique
-- constraint we're about to add doesn't reject case-only duplicates
-- (e.g. Alice@x.com vs alice@x.com). On a clean DB this is a no-op.
UPDATE "Dealer" SET "email" = lower("email") WHERE "email" <> lower("email");

-- If duplicate emails ALREADY exist in the table this CREATE UNIQUE
-- INDEX will fail loudly — that's intentional, because silently
-- merging or dropping dealer rows would lose audit history and
-- listing ownership. If the migration trips, an admin should:
--   1. SELECT email, count(*) FROM "Dealer" GROUP BY email HAVING count(*) > 1;
--   2. Decide which row to keep, archive the others (or change their email),
--   3. Re-run the migration.
CREATE UNIQUE INDEX "Dealer_email_key" ON "Dealer"("email");
