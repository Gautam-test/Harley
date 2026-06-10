-- Client feedback #17: VIN is now optional on TradeInLead. Drop the
-- NOT NULL constraint so sellers can submit without a VIN; dealers fill
-- it in from the lead detail drawer once confirmed.
ALTER TABLE "TradeInLead" ALTER COLUMN "vin" DROP NOT NULL;

-- Client feedback #16: Add upgradeTimeline column for the "Looking for
-- upgrade?" radio field captured during the Sell Your Motorcycle flow.
-- Nullable text, one of: 'not-now' | 'within-6-months' |
-- 'within-12-months' | 'immediately'. No enum in DB — kept as a plain
-- string so adding new options requires no further migration.
ALTER TABLE "TradeInLead" ADD COLUMN "upgradeTimeline" TEXT;
