import { test, expect, request, type APIRequestContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Bug 2a — admin removal of DRAFT preserves image files; admin removal of
// ACTIVE deletes them.
//
// The dealer must be able to open a previously-admin-removed DRAFT in the
// edit wizard and see the photos they uploaded (so they can fix what the
// admin flagged and resubmit). Before the fix, the admin /remove handler
// unconditionally unlinked every <uuid>.webp file referenced by the
// listing — including for DRAFT removes — so on hydration the wizard
// rendered broken images.
//
// What we verify here:
//   1. Upload an image as a dealer → file exists on disk + reachable
//      via /api/v1/uploads/listing-images/<uuid>.webp
//   2. Create a DRAFT listing using that image.
//   3. Admin /remove on the DRAFT.
//   4. Image is STILL reachable (file preserved). Status is REMOVED.
//   5. Separate cycle: create + publish to ACTIVE → admin /remove.
//   6. Image is now 404 (file cleaned up).

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:4001/api/v1';
// Disk path the API writes to: apps/api/.uploads/listing-images.
const UPLOAD_ROOT = path.resolve(
  HERE,
  '..',
  '..',
  'apps',
  'api',
  '.uploads',
  'listing-images',
);

function uniqueVin(): string {
  // 17 chars, no I/O/Q. The Torque mock gates by the VIN's last 4
  // chars matching the dealer's torqueDealerId — gurgaon-hd's ID is
  // "0001", so the VIN must end "0001". Randomise positions 7-13 to
  // dodge collisions with seed data and previous test runs.
  const chars = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'; // no I/O/Q
  let mid = '';
  for (let i = 0; i < 7; i++) {
    mid += chars[Math.floor(Math.random() * chars.length)];
  }
  // 6-char prefix + 7-char random + 4-char dealer-id = 17.
  return `1HD3CF${mid}0001`;
}

async function dealerToken(api: APIRequestContext): Promise<string> {
  const r = await api.post(`${API_BASE}/auth/dealer/login`, {
    data: { username: 'gurgaon-hd', password: 'Dealer@123!' },
  });
  if (!r.ok()) throw new Error(`dealer login: ${r.status()}`);
  return (await r.json()).accessToken;
}

async function adminToken(api: APIRequestContext): Promise<string> {
  const r = await api.post(`${API_BASE}/auth/admin/login`, {
    data: { email: 'admin@hd-cpo.local', password: 'Admin@123!' },
  });
  if (!r.ok()) throw new Error(`admin login: ${r.status()}`);
  return (await r.json()).accessToken;
}

// Drop a placeholder file straight onto the disk where the API serves
// listing images from. We're not exercising the upload route here —
// only the admin-remove cleanup gate — so we skip the sharp-resize
// pipeline by writing the file directly with the same naming convention
// (`<uuid>.webp` + `<uuid>-thumb.webp`). The API's serve route checks
// for file existence, so any binary content is fine for the GET probe.
function seedImageOnDisk(): { url: string; filename: string; thumbFilename: string } {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
  // crypto.randomUUID is global in Node 19+; the test runtime is Node 24.
  const id = (globalThis.crypto as Crypto).randomUUID();
  const filename = `${id}.webp`;
  const thumbFilename = `${id}-thumb.webp`;
  // Minimal WebP container (VP8L lossless 1x1 transparent). The API's
  // /listing-images/:filename route serves the file as application/
  // octet-stream by default; sharp isn't invoked on the read path.
  const webp = Buffer.from(
    'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaACdLoB+AAA',
    'base64',
  );
  fs.writeFileSync(path.join(UPLOAD_ROOT, filename), webp);
  fs.writeFileSync(path.join(UPLOAD_ROOT, thumbFilename), webp);
  return {
    url: `/api/v1/uploads/listing-images/${filename}`,
    filename,
    thumbFilename,
  };
}

interface CreateResult {
  id: string;
  imageUrl: string;
  imageFilename: string;
}

async function createDraftWithImage(
  api: APIRequestContext,
  dealer: string,
): Promise<CreateResult & { thumbFilename: string }> {
  const { url, filename, thumbFilename } = seedImageOnDisk();
  const vin = uniqueVin();
  const create = await api.post(`${API_BASE}/dealer/listings`, {
    headers: { Authorization: `Bearer ${dealer}` },
    data: {
      vin,
      price: 1_400_000,
      kmsDriven: 15_000,
      owners: 1,
      description:
        'QA Bug 2a — file-preservation spec. This listing is created so the admin can remove it and we can check whether the image survives.',
      images: [url, url, url, url, url],
      inspectionReportUrl: null,
      certificationStatus: 'AS_IS',
      cpoDocs: null,
    },
  });
  if (!create.ok()) throw new Error(`create: ${create.status()} ${await create.text()}`);
  const { id } = (await create.json()) as { id: string };
  return { id, imageUrl: url, imageFilename: filename, thumbFilename };
}

async function adminRemove(
  api: APIRequestContext,
  adminTok: string,
  listingId: string,
  reason: string,
) {
  const r = await api.post(`${API_BASE}/admin/listings/${listingId}/remove`, {
    headers: { Authorization: `Bearer ${adminTok}` },
    data: { reason },
  });
  if (!r.ok()) throw new Error(`admin remove: ${r.status()} ${await r.text()}`);
}

async function adminPublish(
  api: APIRequestContext,
  adminTok: string,
  listingId: string,
) {
  const r = await api.post(`${API_BASE}/admin/listings/${listingId}/publish`, {
    headers: { Authorization: `Bearer ${adminTok}` },
  });
  if (!r.ok()) throw new Error(`admin publish: ${r.status()} ${await r.text()}`);
}

function diskPath(filename: string): string {
  return path.join(UPLOAD_ROOT, filename);
}

test.describe('Bug 2a — admin removal preserves files only for non-public statuses', () => {
  test('DRAFT remove preserves image file + URL still resolves for the owning dealer', async () => {
    const api = await request.newContext();
    const dealer = await dealerToken(api);
    const admin = await adminToken(api);
    const { id, imageUrl, imageFilename } = await createDraftWithImage(api, dealer);

    // Sanity: file exists right after create + URL serves (DRAFT is on
    // the soft-tier public list per uploads.routes.ts so no auth needed).
    expect(fs.existsSync(diskPath(imageFilename)), 'file on disk pre-remove').toBe(
      true,
    );
    const preGet = await api.get(`http://localhost:4001${imageUrl}`);
    expect(preGet.status(), 'image URL 200 pre-remove').toBe(200);

    await adminRemove(api, admin, id, 'QA Bug 2a — DRAFT remove should keep files');

    // Disk file MUST still exist — that's the real "preserved" contract.
    expect(
      fs.existsSync(diskPath(imageFilename)),
      'file on disk preserved after DRAFT remove',
    ).toBe(true);

    // The serve route auth-gates REMOVED listings to owner + admin only
    // (existing behaviour, unrelated to Bug 2a). An anonymous GET returns
    // 404 even though the file exists. Probe with the dealer's bearer
    // token to confirm the byte stream is reachable — that's the path
    // the wizard's hydrate flow uses indirectly.
    const ownedGet = await api.get(`http://localhost:4001${imageUrl}`, {
      headers: { Authorization: `Bearer ${dealer}` },
    });
    expect(
      ownedGet.status(),
      'image URL 200 for owning dealer after DRAFT remove',
    ).toBe(200);
  });

  test('ACTIVE remove DELETES image file (existing public-takedown behaviour)', async () => {
    const api = await request.newContext();
    const dealer = await dealerToken(api);
    const admin = await adminToken(api);
    const { id, imageUrl, imageFilename } = await createDraftWithImage(api, dealer);

    // Publish to ACTIVE first.
    await adminPublish(api, admin, id);

    expect(fs.existsSync(diskPath(imageFilename))).toBe(true);

    await adminRemove(api, admin, id, 'QA Bug 2a — ACTIVE remove should clean files');

    // ACTIVE rows were public — the cleanup must run. The .webp and the
    // -thumb.webp variants both go.
    expect(
      fs.existsSync(diskPath(imageFilename)),
      'file deleted after ACTIVE remove',
    ).toBe(false);
    const postGet = await api.get(`http://localhost:4001${imageUrl}`);
    expect(postGet.status(), 'image URL 404 after ACTIVE remove').toBe(404);
  });
});
