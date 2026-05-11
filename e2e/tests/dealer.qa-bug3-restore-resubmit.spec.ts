import { test, expect, request, type APIRequestContext } from '@playwright/test';

// Bug 3 — Restore + Resubmit: dealer opens a REMOVED listing, edits it,
// submits → listing moves back to DRAFT (shows under Pending tab).
//
// Scenarios:
//   A. DRAFT → admin Remove → dealer Edit + Submit → status is DRAFT
//   B. ACTIVE → admin Remove → dealer Edit + Submit → status is DRAFT
//   C. Verify the listing appears in the dealer's Pending (DRAFT) tab
//      after restore.

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:4001/api/v1';
const DEALER_BASE = process.env.DEALER_BASE_URL ?? 'http://localhost:5181/dealer/';

function uniqueVin(): string {
  const chars = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
  let mid = '';
  for (let i = 0; i < 7; i++) mid += chars[Math.floor(Math.random() * chars.length)];
  return `1HD3CF${mid}0001`;
}

async function dealerToken(api: APIRequestContext): Promise<string> {
  const r = await api.post(`${API_BASE}/auth/dealer/login`, {
    data: { username: 'gurgaon-hd', password: 'Dealer@123!' },
  });
  if (!r.ok()) throw new Error('dealer login');
  return (await r.json()).accessToken;
}

async function adminToken(api: APIRequestContext): Promise<string> {
  const r = await api.post(`${API_BASE}/auth/admin/login`, {
    data: { email: 'admin@hd-cpo.local', password: 'Admin@123!' },
  });
  if (!r.ok()) throw new Error('admin login');
  return (await r.json()).accessToken;
}

async function createDraft(api: APIRequestContext, token: string): Promise<string> {
  const create = await api.post(`${API_BASE}/dealer/listings`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      vin: uniqueVin(),
      price: 1_400_000,
      kmsDriven: 15_000,
      owners: 1,
      description: 'QA Bug 3 — Restore + Resubmit smoke.',
      images: ['a', 'b', 'c', 'd', 'e'],
      inspectionReportUrl: null,
      certificationStatus: 'AS_IS',
      cpoDocs: null,
    },
  });
  if (!create.ok()) throw new Error(`create: ${create.status()} ${await create.text()}`);
  return (await create.json()).id as string;
}

async function adminRemove(api: APIRequestContext, adminTok: string, id: string) {
  const r = await api.post(`${API_BASE}/admin/listings/${id}/remove`, {
    headers: { Authorization: `Bearer ${adminTok}` },
    data: { reason: 'QA Bug 3 — admin remove for restore test' },
  });
  if (!r.ok()) throw new Error(`admin remove: ${r.status()} ${await r.text()}`);
}

async function adminPublish(api: APIRequestContext, adminTok: string, id: string) {
  const r = await api.post(`${API_BASE}/admin/listings/${id}/publish`, {
    headers: { Authorization: `Bearer ${adminTok}` },
  });
  if (!r.ok()) throw new Error(`admin publish: ${r.status()} ${await r.text()}`);
}

async function getListing(api: APIRequestContext, token: string, id: string) {
  const r = await api.get(`${API_BASE}/dealer/listings/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok()) throw new Error(`get listing: ${r.status()} ${await r.text()}`);
  return r.json();
}

async function updateListing(
  api: APIRequestContext,
  token: string,
  id: string,
  patch: Record<string, unknown>,
) {
  const r = await api.patch(`${API_BASE}/dealer/listings/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: patch,
  });
  if (!r.ok()) throw new Error(`update listing: ${r.status()} ${await r.text()}`);
  return r.json();
}

test.describe('Bug 3 — Restore + Resubmit moves REMOVED listing back to DRAFT', () => {
  test('A · DRAFT → admin Remove → dealer Edit → status flips to DRAFT', async () => {
    const api = await request.newContext();
    const dealer = await dealerToken(api);
    const admin = await adminToken(api);
    const id = await createDraft(api, dealer);

    // Verify it starts as DRAFT.
    const before = await getListing(api, dealer, id);
    expect(before.status).toBe('DRAFT');

    // Admin removes it.
    await adminRemove(api, admin, id);
    const removed = await getListing(api, dealer, id);
    expect(removed.status).toBe('REMOVED');

    // Dealer edits the listing (simulating the "fix and resubmit" flow).
    const updated = await updateListing(api, dealer, id, {
      description: 'QA Bug 3 — fixed and resubmitted',
      price: 1_500_000,
    });
    expect(updated.status, 'status should flip back to DRAFT after restore').toBe('DRAFT');
  });

  test('B · ACTIVE → admin Remove → dealer Edit → status flips to DRAFT', async () => {
    const api = await request.newContext();
    const dealer = await dealerToken(api);
    const admin = await adminToken(api);
    const id = await createDraft(api, dealer);

    // Publish to ACTIVE first.
    await adminPublish(api, admin, id);
    const active = await getListing(api, dealer, id);
    expect(active.status).toBe('ACTIVE');

    // Admin removes the ACTIVE listing.
    await adminRemove(api, admin, id);
    const removed = await getListing(api, dealer, id);
    expect(removed.status).toBe('REMOVED');

    // Dealer edits → should flip to DRAFT.
    const updated = await updateListing(api, dealer, id, {
      description: 'QA Bug 3 — was ACTIVE, removed, now restored',
    });
    expect(updated.status, 'status should flip back to DRAFT').toBe('DRAFT');
  });

  test('C · After restore, adminFeedback is cleared', async () => {
    const api = await request.newContext();
    const dealer = await dealerToken(api);
    const admin = await adminToken(api);
    const id = await createDraft(api, dealer);

    await adminRemove(api, admin, id);
    const removed = await getListing(api, dealer, id);
    expect(removed.status).toBe('REMOVED');

    // Dealer edits.
    const updated = await updateListing(api, dealer, id, {
      description: 'Bug 3 — adminFeedback should be null after resubmit',
    });
    expect(updated.status).toBe('DRAFT');
    // Re-fetch to check adminFeedback (PATCH response is slim).
    const after = await getListing(api, dealer, id);
    expect(after.adminFeedback, 'adminFeedback cleared on resubmit').toBeNull();
  });

  test('D · DRAFT edit (not REMOVED) does NOT change status', async () => {
    const api = await request.newContext();
    const dealer = await dealerToken(api);
    const id = await createDraft(api, dealer);

    // Edit without removing — status should stay DRAFT (not a restore scenario).
    const updated = await updateListing(api, dealer, id, {
      description: 'Bug 3 — normal DRAFT edit, no status change',
    });
    expect(updated.status, 'DRAFT stays DRAFT on normal edit').toBe('DRAFT');
  });
});
