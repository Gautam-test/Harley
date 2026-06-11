/**
 * Regression tests for the enquiry duplicate-by-mobile gate (Group D —
 * 4 QA tickets covering buyer + seller enquiry creation on both the
 * customer portal and the dealer portal).
 *
 * The rule: a customer / seller cannot open a second enquiry with the
 * same mobile number while a previous one is still open. The dealer
 * marking the previous lead Not Interested (DEAD / LOST today, plus
 * NOT_INTERESTED once buyer-pipeline-v2 lands) clears the gate and the
 * customer can submit a fresh enquiry.
 *
 * Buyer enquiries are scoped to a single listing (so the same mobile
 * can hold an open enquiry on Bike A AND a separate one on Bike B).
 * Trade-in enquiries dedup globally by phone (one open seller-enquiry
 * per number across the system).
 *
 * The buyer SPA used to pre-block the Visit-Dealer click via a
 * /my-status pre-check, which confused users into thinking the form
 * was broken. Now: the modal always opens, the user fills the form,
 * and the API enforces the rule on submit. These tests pin the
 * server-side behaviour so any future SPA regression still surfaces
 * the gate cleanly.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://x:y@localhost:5432/z';
  process.env.REDIS_URL = 'mock://';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(64);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
  process.env.OTP_VERIFIED_TOKEN_SECRET = 'c'.repeat(32);
  process.env.PII_ENCRYPTION_KEY = 'test-pii-encryption-key-1234567890';
});

const enquiryFindMany = vi.fn();
const enquiryCreate = vi.fn();
const tradeInLeadFindMany = vi.fn();
const tradeInLeadFindFirst = vi.fn();
const tradeInLeadCreate = vi.fn();
const listingFindUnique = vi.fn();
const listingFindFirst = vi.fn();
const dealerFindFirst = vi.fn();
const dealerFindUnique = vi.fn();

vi.mock('../../config/prisma.js', () => ({
  prisma: {
    enquiry: {
      findMany: (...args: unknown[]) => enquiryFindMany(...args),
      create: (...args: unknown[]) => enquiryCreate(...args),
    },
    tradeInLead: {
      findMany: (...args: unknown[]) => tradeInLeadFindMany(...args),
      findFirst: (...args: unknown[]) => tradeInLeadFindFirst(...args),
      create: (...args: unknown[]) => tradeInLeadCreate(...args),
    },
    listing: {
      findUnique: (...args: unknown[]) => listingFindUnique(...args),
      findFirst: (...args: unknown[]) => listingFindFirst(...args),
    },
    dealer: {
      findFirst: (...args: unknown[]) => dealerFindFirst(...args),
      findUnique: (...args: unknown[]) => dealerFindUnique(...args),
    },
  },
}));

vi.mock('../dealers/dealer-routing.js', () => ({
  nearestActiveDealer: vi.fn().mockResolvedValue('dealer-1'),
}));

vi.mock('../email/email.module.js', () => ({
  // notifyDealer calls dealerLeadEmail() and then mutates the returned
  // object (msg.to = dealer.email), so the mock must return a real
  // object — a bare vi.fn() would resolve undefined and crash the .to
  // assignment downstream.
  dealerLeadEmail: vi.fn().mockReturnValue({ subject: 'x', html: 'x', to: '' }),
  // Email triggers #1 + #2: the leads service now also imports these
  // buyer-facing templates, so the mock must expose them or vitest's
  // import resolution throws 'No export defined on the mock'.
  buyerEnquiryConfirmationEmail: vi.fn().mockReturnValue({ subject: 'x', html: 'x', to: '' }),
  buyerDealerUpdateEmail: vi.fn().mockReturnValue({ subject: 'x', html: 'x', to: '' }),
  sellerTradeInConfirmationEmail: vi.fn().mockReturnValue({ subject: 'x', html: 'x', to: '' }),
  emailProvider: () => ({ send: vi.fn().mockResolvedValue(undefined) }),
}));

beforeEach(() => {
  enquiryFindMany.mockReset();
  enquiryCreate.mockReset();
  tradeInLeadFindMany.mockReset();
  tradeInLeadFindFirst.mockReset();
  tradeInLeadCreate.mockReset();
  listingFindUnique.mockReset();
  listingFindFirst.mockReset();
  dealerFindFirst.mockReset();
  dealerFindUnique.mockReset();
  // Default: notifyDealer's downstream prisma.dealer.findUnique returns
  // a stub dealer so the email-notify path doesn't crash on tests that
  // exercise the happy path (create succeeds → notifyDealer fires).
  dealerFindUnique.mockResolvedValue({
    id: 'dealer-1',
    name: 'Test Dealer',
    email: 'dealer@test.local',
  });
});

const ACTIVE_LISTING = {
  id: 'listing-1',
  dealerId: 'dealer-1',
  modelName: 'Street Bob 114',
  year: 2024,
  status: 'ACTIVE',
};

const BUYER_INPUT = {
  name: 'Test Buyer',
  phone: '+919999900000',
  email: 'buyer@example.com',
  city: 'Gurgaon',
  pincode: '122001',
  message: 'Interested',
};

// Encrypts the buyer's phone using the same crypto path the API uses,
// so the dedup helper's decrypt-and-compare actually matches.
async function encrypt(plain: string): Promise<string> {
  const { encryptPii } = await import('../../utils/crypto.js');
  return encryptPii(plain);
}

describe('createBuyerEnquiry — duplicate-by-mobile gate', () => {
  it('rejects a second enquiry on the same listing with the same phone', async () => {
    const { createBuyerEnquiry } = await import('./leads.service.js');
    listingFindUnique.mockResolvedValueOnce(ACTIVE_LISTING);
    enquiryFindMany.mockResolvedValueOnce([
      { id: 'open-1', phoneEnc: await encrypt(BUYER_INPUT.phone) },
    ]);

    await expect(createBuyerEnquiry('slug', BUYER_INPUT)).rejects.toMatchObject({
      status: 409,
      code: 'ENQUIRY_ALREADY_OPEN',
    });
    expect(enquiryCreate).not.toHaveBeenCalled();

    // Verify the lookup excluded terminal statuses (Not-Interested unlock).
    const findArgs = enquiryFindMany.mock.calls[0]![0] as {
      where: { status: { notIn: string[] } };
    };
    expect(findArgs.where.status.notIn).toEqual(expect.arrayContaining(['DEAD', 'LOST']));
  });

  it('allows a fresh enquiry when the previous one was marked Not Interested (DEAD/LOST)', async () => {
    const { createBuyerEnquiry } = await import('./leads.service.js');
    listingFindUnique.mockResolvedValueOnce(ACTIVE_LISTING);
    // notIn:['DEAD','LOST'] means the DB returns no rows — the previous
    // enquiry was marked terminal and is filtered out at query time.
    enquiryFindMany.mockResolvedValueOnce([]);
    enquiryCreate.mockResolvedValueOnce({ id: 'new-enquiry-1' });

    const result = await createBuyerEnquiry('slug', BUYER_INPUT);
    expect(result).toEqual({ id: 'new-enquiry-1' });
    expect(enquiryCreate).toHaveBeenCalledOnce();
  });

  it('allows a different mobile to enquire on the same listing', async () => {
    const { createBuyerEnquiry } = await import('./leads.service.js');
    listingFindUnique.mockResolvedValueOnce(ACTIVE_LISTING);
    enquiryFindMany.mockResolvedValueOnce([
      { id: 'open-1', phoneEnc: await encrypt('+919111100000') }, // different number
    ]);
    enquiryCreate.mockResolvedValueOnce({ id: 'new-enquiry-2' });

    const result = await createBuyerEnquiry('slug', BUYER_INPUT);
    expect(result.id).toBe('new-enquiry-2');
  });

  it('still 404s when the listing is missing or inactive (existing behaviour)', async () => {
    const { createBuyerEnquiry } = await import('./leads.service.js');
    listingFindUnique.mockResolvedValueOnce({ ...ACTIVE_LISTING, status: 'SOLD' });

    await expect(createBuyerEnquiry('slug', BUYER_INPUT)).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
    // Dedup query never runs because we bail on the listing check first.
    expect(enquiryFindMany).not.toHaveBeenCalled();
  });
});

describe('createTradeInLead — duplicate-by-mobile gate (global)', () => {
  const TRADE_IN_INPUT = {
    username: 'Seller Test',
    bikeModel: 'Iron 883',
    vin: '1HD1KHM18MB678901',
    phone: '+919888800000',
    email: 'seller@example.com',
    city: 'Gurgaon',
  };

  it('rejects a second trade-in lead for the same VIN while a lead is open', async () => {
    const { createTradeInLead } = await import('./leads.service.js');
    dealerFindFirst.mockResolvedValueOnce(null);
    // checkTradeInVinGate: findFirst returns an open lead → OPEN_LEAD → 409
    tradeInLeadFindFirst.mockResolvedValueOnce({ id: 'open-trade-1' });

    await expect(createTradeInLead(TRADE_IN_INPUT)).rejects.toMatchObject({
      status: 409,
      code: 'SELLER_ENQUIRY_ALREADY_OPEN',
    });
    expect(tradeInLeadCreate).not.toHaveBeenCalled();
  });

  it('allows a fresh trade-in when no open or blocking lead exists', async () => {
    const { createTradeInLead } = await import('./leads.service.js');
    dealerFindFirst.mockResolvedValueOnce(null);
    // checkTradeInVinGate: first findFirst = null (no open lead), second findFirst = null (no closed lead)
    tradeInLeadFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    tradeInLeadCreate.mockResolvedValueOnce({ id: 'new-trade-1' });

    const result = await createTradeInLead(TRADE_IN_INPUT);
    expect(result.id).toBe('new-trade-1');
  });
});

describe('dealerCreateBuyerEnquiry — same gate applies to dealer-portal logging', () => {
  const DEALER_BUYER_INPUT = {
    ...BUYER_INPUT,
    listingId: 'listing-1',
    source: 'phone' as const,
  };

  it('rejects when the listing already has an open enquiry for this phone', async () => {
    const { dealerCreateBuyerEnquiry } = await import('./leads.service.js');
    listingFindFirst.mockResolvedValueOnce({
      id: 'listing-1',
      modelName: 'Street Bob 114',
      year: 2024,
      status: 'ACTIVE',
    });
    enquiryFindMany.mockResolvedValueOnce([
      { id: 'open-1', phoneEnc: await encrypt(BUYER_INPUT.phone) },
    ]);

    await expect(
      dealerCreateBuyerEnquiry('dealer-1', DEALER_BUYER_INPUT),
    ).rejects.toMatchObject({ status: 409, code: 'ENQUIRY_ALREADY_OPEN' });
  });

  it('allows when no open enquiry exists', async () => {
    const { dealerCreateBuyerEnquiry } = await import('./leads.service.js');
    listingFindFirst.mockResolvedValueOnce({
      id: 'listing-1',
      modelName: 'Street Bob 114',
      year: 2024,
      status: 'ACTIVE',
    });
    enquiryFindMany.mockResolvedValueOnce([]);
    enquiryCreate.mockResolvedValueOnce({ id: 'new-1' });

    const result = await dealerCreateBuyerEnquiry('dealer-1', DEALER_BUYER_INPUT);
    expect(result.id).toBe('new-1');
  });
});

describe('dealerCreateTradeInLead — same gate applies to dealer-portal logging', () => {
  const DEALER_TRADE_INPUT = {
    username: 'Seller Test',
    bikeModel: 'Iron 883',
    vin: '1HD1KHM18MB678901',
    phone: '+919777700000',
    email: 'seller@example.com',
    city: 'Gurgaon',
    source: 'walk-in' as const,
  };

  it('rejects when the same VIN already has an open trade-in lead', async () => {
    const { dealerCreateTradeInLead } = await import('./leads.service.js');
    // checkTradeInVinGate: findFirst returns an open lead → OPEN_LEAD → 409
    tradeInLeadFindFirst.mockResolvedValueOnce({ id: 'open-trade-1' });

    await expect(
      dealerCreateTradeInLead('dealer-1', DEALER_TRADE_INPUT),
    ).rejects.toMatchObject({ status: 409, code: 'SELLER_ENQUIRY_ALREADY_OPEN' });
  });

  it('allows when no open or blocking trade-in lead exists', async () => {
    const { dealerCreateTradeInLead } = await import('./leads.service.js');
    // checkTradeInVinGate: first findFirst = null (no open lead), second findFirst = null (no closed lead)
    tradeInLeadFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    tradeInLeadCreate.mockResolvedValueOnce({ id: 'new-trade-1' });

    const result = await dealerCreateTradeInLead('dealer-1', DEALER_TRADE_INPUT);
    expect(result.id).toBe('new-trade-1');
  });
});
