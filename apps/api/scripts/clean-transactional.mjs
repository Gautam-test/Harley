// One-shot cleanup: wipe all transactional data from the DB while preserving
// auth + identity (AdminUser, Dealer) and CMS-style rows (StaticContent).
//
// Deletion order respects foreign-key dependencies:
//   1. OrderEvent → Order
//   2. Order      → Listing
//   3. Enquiry    → Listing
//   4. LeadComment→ TradeInLead/GeneralLead
//   5. TradeInLead, GeneralLead
//   6. Listing    → Dealer (FK preserved; dealer rows stay)
//   7. OtpVerification (no FK)
//   8. AuditLog (text-only refs, safe to wipe)
//
// Run with:  node apps/api/scripts/clean-transactional.mjs
// Requires the same DATABASE_URL env var the api uses.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const before = await counts();
  console.log('Before cleanup:');
  console.table(before);

  // Foreign-key-safe deletion order.
  const ops = await prisma.$transaction([
    prisma.orderEvent.deleteMany({}),
    prisma.order.deleteMany({}),
    prisma.enquiry.deleteMany({}),
    prisma.leadComment.deleteMany({}),
    prisma.tradeInLead.deleteMany({}),
    prisma.generalLead.deleteMany({}),
    prisma.listing.deleteMany({}),
    prisma.otpVerification.deleteMany({}),
    prisma.auditLog.deleteMany({}),
  ]);

  console.log('Deleted rows:');
  console.table({
    OrderEvent: ops[0].count,
    Order: ops[1].count,
    Enquiry: ops[2].count,
    LeadComment: ops[3].count,
    TradeInLead: ops[4].count,
    GeneralLead: ops[5].count,
    Listing: ops[6].count,
    OtpVerification: ops[7].count,
    AuditLog: ops[8].count,
  });

  const after = await counts();
  console.log('After cleanup:');
  console.table(after);
}

async function counts() {
  const [
    adminUser, dealer, staticContent,
    listing, enquiry, generalLead, tradeInLead, leadComment,
    order, orderEvent, otp, audit,
  ] = await Promise.all([
    prisma.adminUser.count(),
    prisma.dealer.count(),
    prisma.staticContent.count(),
    prisma.listing.count(),
    prisma.enquiry.count(),
    prisma.generalLead.count(),
    prisma.tradeInLead.count(),
    prisma.leadComment.count(),
    prisma.order.count(),
    prisma.orderEvent.count(),
    prisma.otpVerification.count(),
    prisma.auditLog.count(),
  ]);
  return {
    'KEEP - AdminUser': adminUser,
    'KEEP - Dealer': dealer,
    'KEEP - StaticContent': staticContent,
    'wipe - Listing': listing,
    'wipe - Enquiry': enquiry,
    'wipe - GeneralLead': generalLead,
    'wipe - TradeInLead': tradeInLead,
    'wipe - LeadComment': leadComment,
    'wipe - Order': order,
    'wipe - OrderEvent': orderEvent,
    'wipe - OtpVerification': otp,
    'wipe - AuditLog': audit,
  };
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
