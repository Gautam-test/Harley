-- BUG-051 extended: dealer phone is now unique alongside email + username.
-- Same 3-step dedupe-then-constrain pattern as the email migration
-- (20260608120000_dealer_email_unique) so this can never fail-stop a
-- deploy on a DB that already has duplicate phone rows.

-- Step 1: trim whitespace defensively (no-op on clean data).
UPDATE "Dealer" SET "phone" = trim("phone") WHERE "phone" <> trim("phone");

-- Step 2: keep the OLDEST createdAt row per phone, rename every
-- subsequent duplicate's phone to "<phone>-dup-<dealerId[0..8]>".
-- The "-dup-" suffix is deliberately ugly so the admin notices it in
-- the Dealers list and re-edits to a real phone. The +91XXXXXXXXXX
-- zod regex will reject the suffixed string on next Edit Dealer
-- save — forcing the admin to type a fresh number. Auth doesn't use
-- phone (login is username + password), so dealers are not locked out.
WITH ranked AS (
  SELECT
    "id",
    "phone",
    row_number() OVER (PARTITION BY "phone" ORDER BY "createdAt", "id") AS rn
  FROM "Dealer"
)
UPDATE "Dealer" d
SET "phone" = d."phone" || '-dup-' || substring(d."id" FROM 1 FOR 8)
FROM ranked r
WHERE r."id" = d."id" AND r.rn > 1;

-- Step 3: add the unique constraint. Guaranteed to succeed after Step 2.
CREATE UNIQUE INDEX "Dealer_phone_key" ON "Dealer"("phone");
