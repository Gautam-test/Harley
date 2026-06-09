-- Follow-up to 20260609140000_backfill_flagship_dealer_emails which
-- matched by username='gurgaon-hd' / 'mumbai-hd'. On demo the Capital
-- + Seven Islands dealers were imported with different usernames (the
-- earlier migration did not update any rows there), so this migration
-- backfills by dealer NAME — the one stable identifier across all
-- environments.
--
-- Idempotent: the WHERE clause skips rows whose email is already set,
-- so re-applying does nothing.
--
-- Safe against the @unique(email) constraint: the target email values
-- are unique to these two dealers across the entire seed + seed-extra
-- catalogue (Capital uses sales@capital-hd, Seven Islands uses
-- sales@7islands-hd — neither collides with any seed-extra entry).

UPDATE "Dealer"
   SET "email" = 'sales@capital-hd.example.in'
 WHERE "name" = 'Capital Harley-Davidson Gurgaon'
   AND ("email" IS NULL OR "email" = '');

UPDATE "Dealer"
   SET "email" = 'sales@7islands-hd.example.in'
 WHERE "name" = 'Seven Islands Harley-Davidson Mumbai'
   AND ("email" IS NULL OR "email" = '');
