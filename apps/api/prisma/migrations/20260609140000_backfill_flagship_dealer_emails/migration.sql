-- Backfill the email column on the two main-seed dealers (Capital Gurgaon
-- and Seven Islands Mumbai). The Dealer.email column was added by
-- 20260608120000_dealer_email_unique, but the two rows created before
-- that migration kept their email as NULL. The main seed.ts upsert had
-- `update: {}` so re-deploys never refreshed them, leaving every PDP's
-- "View Dealer Details" modal without an Email row.
--
-- Idempotent: WHERE email IS NULL guards prevent overwriting a value that
-- was already set (whether by a later seed.ts run with the new update
-- clause, or by admin manual edit).
--
-- The UPDATE is also safe against the @unique(email) constraint because
-- both target emails are unique to their respective dealers across the
-- full seed + seed-extra dataset.

UPDATE "Dealer"
   SET "email" = 'sales@capital-hd.example.in'
 WHERE "username" = 'gurgaon-hd'
   AND ("email" IS NULL OR "email" = '');

UPDATE "Dealer"
   SET "email" = 'sales@7islands-hd.example.in'
 WHERE "username" = 'mumbai-hd'
   AND ("email" IS NULL OR "email" = '');
