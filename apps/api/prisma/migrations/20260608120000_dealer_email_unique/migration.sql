-- BUG-051: enforce dealer email uniqueness at the database layer so a
-- second admin (or a direct DB insert / import script) cannot create
-- a duplicate dealer with the same email. Pairs with the service-layer
-- pre-check in adminCreateDealer / adminUpdateDealer that returns the
-- spec-mandated friendly error to the admin UI.
--
-- Demo DB already carries duplicate rows from earlier testing (5+
-- dealers sharing jindal.shibesh@orangemantra.in, etc.), so this
-- migration cannot simply `CREATE UNIQUE INDEX` — it would abort.
-- Strategy: lowercase first, then auto-rename duplicates so the index
-- creation always succeeds without losing any dealer row, listing
-- ownership, lead history, or audit trail.

-- ─── Step 1: lowercase normalise ─────────────────────────────────────
-- Idempotent. Makes the upcoming uniqueness check case-insensitive
-- and matches how the service layer writes new rows post-BUG-051.
UPDATE "Dealer" SET "email" = lower("email") WHERE "email" <> lower("email");

-- ─── Step 2: dedupe by email — keep the oldest, suffix the rest ─────
-- For every email shared by >1 row, the row with the OLDEST createdAt
-- keeps the email verbatim. Every other row gets its email rewritten
-- to "<localpart>+dup-<shortid>@<domain>" using its dealer.id, which
-- is guaranteed unique. The "+dup-" tag is a deliberate flag: an
-- admin scanning the Dealers list can grep / filter for it and decide
-- which rows to archive, merge, or correct.
--
-- Login is unaffected — dealers authenticate by username, not email,
-- so renaming the email column doesn't lock anyone out. Password-reset
-- (which DOES use email) will route to the suffixed address; if a
-- duplicated dealer needs to reset, an admin can update the email
-- back via the Edit Dealer modal first (now also gated by the same
-- uniqueness check, so they can't re-create a clash).
--
-- substring / strpos approach used so this works on any Postgres
-- version >= 9.5 (the demo runs 14+). Falls back gracefully if the
-- email lacks an "@" (treats whole string as local-part).
WITH ranked AS (
  SELECT
    "id",
    "email",
    row_number() OVER (PARTITION BY "email" ORDER BY "createdAt", "id") AS rn
  FROM "Dealer"
)
UPDATE "Dealer" d
SET "email" =
  CASE
    WHEN position('@' IN d."email") > 0 THEN
      substring(d."email" FROM 1 FOR position('@' IN d."email") - 1)
        || '+dup-' || substring(d."id" FROM 1 FOR 8)
        || substring(d."email" FROM position('@' IN d."email"))
    ELSE
      d."email" || '+dup-' || substring(d."id" FROM 1 FOR 8)
  END
FROM ranked r
WHERE r."id" = d."id" AND r.rn > 1;

-- ─── Step 3: add the unique constraint ──────────────────────────────
-- After Step 2 every row carries a distinct email, so this always
-- succeeds. From this point forward Prisma findUnique({where:{email}})
-- works, and any future duplicate write (direct SQL, API import, etc.)
-- hits Postgres-level rejection with the standard P2002 error that
-- the service layer maps to the friendly "This email address is
-- already registered to another dealer." admin UI error.
CREATE UNIQUE INDEX "Dealer_email_key" ON "Dealer"("email");
