-- Add 6 new stages to the LeadStatus enum for the trade-in pipeline (QA
-- round 3). Postgres ALTER TYPE ... ADD VALUE is non-transactional, so
-- each value is added in its own statement and committed individually.
-- Existing rows on the legacy NEW/CONTACTED/IN_PROGRESS/CLOSED statuses
-- continue to work; the dealer wizard moves them onto the new path via
-- canTransitionLead's off-pipeline branch.

ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'DOCUMENTATION_VERIFICATION';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'TECHNICAL_INSPECTION';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'VALUATION_OFFER';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'NEGOTIATION_ACCEPTANCE';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'LEGAL_TRANSFER';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'TRADE_IN_FINALIZED';
