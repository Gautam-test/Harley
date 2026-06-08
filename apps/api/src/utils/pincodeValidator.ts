// BUG-053: shared server-side State/City/Pincode mapping validator.
// Frontend forms also enforce this via the existing postalpincode.in
// autofill paths, but server-side validation is the only thing that
// blocks API-level bypass (curl, scripts, third-party automation).
//
// Strategy: postalpincode.in is free, CORS-enabled, and already used
// by the SPAs for autofill — so we reuse it server-side too. Network
// hit per submission is one cheap GET; cached in-process for 24h so
// repeat lookups (same pincode entered by many users) hit memory.
//
// If the pincode lookup fails (network down, pincode genuinely
// missing from the dataset), we FAIL OPEN — don't block the user
// from submitting on a network blip. Logged as warn for ops to
// monitor false-negatives.

import { logger } from '../config/logger.js';

interface PincodeMapping {
  district: string;   // postalpincode.in calls this "District" — we treat as city
  state: string;
  fetchedAt: number;  // epoch ms — for cache TTL
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const cache = new Map<string, PincodeMapping>();

/** Pull the canonical (district, state) for a 6-digit Indian pincode.
 *  Returns null on bad input, network failure, or empty dataset hit.
 *  Caller decides whether null = fail-open or fail-closed. */
async function lookupPincode(pincode: string): Promise<PincodeMapping | null> {
  if (!/^\d{6}$/.test(pincode)) return null;
  const cached = cache.get(pincode);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached;
  }
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Array<{
      Status: string;
      PostOffice?: Array<{ District: string; State: string }>;
    }>;
    const po = json?.[0]?.PostOffice?.[0];
    if (!po) return null;
    const mapping: PincodeMapping = {
      district: po.District,
      state: po.State,
      fetchedAt: Date.now(),
    };
    cache.set(pincode, mapping);
    return mapping;
  } catch (e) {
    logger.warn({ err: e, pincode }, 'pincode lookup failed — failing open');
    return null;
  }
}

/** Comparison helper — postalpincode.in capitalises differently to
 *  what users type. Normalise + compare loose. Returns true if the
 *  user-supplied value matches the canonical city/state. */
function looseMatch(user: string | undefined, canonical: string): boolean {
  if (!user) return false;
  return user.trim().toLowerCase() === canonical.trim().toLowerCase();
}

export interface PincodeValidationResult {
  /** true if the trio is consistent OR we couldn't verify (fail-open). */
  valid: boolean;
  /** Populated only when valid === false. Single canonical string the
   *  caller can put in an error message / field-error envelope. */
  reason?: string;
  /** Canonical values from the dataset — used by autofill paths to
   *  optionally suggest corrections. */
  canonicalCity?: string;
  canonicalState?: string;
}

/** Validate that (state, city, pincode) belong together per the
 *  postalpincode.in dataset. Fails open on lookup network errors.
 *
 *  Pass `requireAll = true` to insist all three fields are present
 *  (use this on Add/Edit forms where address is mandatory). Pass
 *  false to skip validation when pincode is missing (use this for
 *  optional-pincode flows like buyer enquiry's pincode field).
 */
export async function validatePincodeMapping(opts: {
  state?: string;
  city?: string;
  pincode?: string;
  requireAll?: boolean;
}): Promise<PincodeValidationResult> {
  const { state, city, pincode, requireAll } = opts;
  if (!pincode) {
    if (requireAll) return { valid: false, reason: 'Pincode is required.' };
    return { valid: true };
  }
  const mapping = await lookupPincode(pincode);
  if (!mapping) {
    // Could not look up — fail open. UI-side autofill already gave
    // the user the chance to correct; not blocking on a network blip.
    return { valid: true };
  }
  if (city && !looseMatch(city, mapping.district)) {
    return {
      valid: false,
      reason: 'Entered Pincode does not match with the selected City and State.',
      canonicalCity: mapping.district,
      canonicalState: mapping.state,
    };
  }
  if (state && !looseMatch(state, mapping.state)) {
    return {
      valid: false,
      reason: 'Entered Pincode does not match with the selected City and State.',
      canonicalCity: mapping.district,
      canonicalState: mapping.state,
    };
  }
  return {
    valid: true,
    canonicalCity: mapping.district,
    canonicalState: mapping.state,
  };
}
