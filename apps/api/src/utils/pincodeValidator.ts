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
  /** Every district name returned by postalpincode.in for this pincode.
   *  A single pincode can map to multiple post offices in different
   *  district names (e.g. 110001 covers "Connaught Place", "New Delhi",
   *  "Central Delhi") — we accept a city match against ANY of them. */
  districts: string[];
  /** Every state name returned. Usually one, but multi-state edge cases
   *  exist on border pincodes. */
  states: string[];
  /** Cached canonical (first PO entry) for autofill suggestions. */
  canonicalCity: string;
  canonicalState: string;
  /** false when lookup returned no PostOffice data (invalid pincode). */
  found: boolean;
  fetchedAt: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, PincodeMapping>();

/** Pull every (district, state) tuple for a 6-digit Indian pincode.
 *  Returns null on bad-input / network-failure (caller fails open in
 *  that case). Returns `{found:false,...}` on empty PostOffice array
 *  (pincode not in dataset — caller should fail CLOSED on this). */
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
    const pos = json?.[0]?.PostOffice ?? [];
    if (pos.length === 0) {
      // Genuinely unknown pincode (e.g. "999999"). Cache the "not found"
      // result so we don't re-hit the API for known-bad pincodes.
      const empty: PincodeMapping = {
        districts: [],
        states: [],
        canonicalCity: '',
        canonicalState: '',
        found: false,
        fetchedAt: Date.now(),
      };
      cache.set(pincode, empty);
      return empty;
    }
    // pos.length is > 0 here, so pos[0] is defined; the cast lets
    // tsc see that under strict noUncheckedIndexedAccess.
    const first = pos[0]!;
    const mapping: PincodeMapping = {
      districts: pos.map((p) => p.District),
      states: pos.map((p) => p.State),
      canonicalCity: first.District,
      canonicalState: first.State,
      found: true,
      fetchedAt: Date.now(),
    };
    cache.set(pincode, mapping);
    return mapping;
  } catch (e) {
    logger.warn({ err: e, pincode }, 'pincode lookup network error — failing open');
    return null;
  }
}

/** Comparison helper. postalpincode.in capitalises + sub-divides
 *  differently to what users type ("Delhi" vs "New Delhi" vs "Central
 *  Delhi"). To avoid false positives we accept a match if user value
 *  contains ANY canonical entry, or vice-versa, after lowercase normalisation.
 *  e.g. user "Delhi" matches canonical "New Delhi"; user "New Delhi"
 *  matches canonical "Delhi". */
function looseMatchAny(user: string | undefined, canonicals: string[]): boolean {
  if (!user) return false;
  const u = user.trim().toLowerCase();
  if (!u) return false;
  return canonicals.some((c) => {
    const cn = c.trim().toLowerCase();
    return u === cn || u.includes(cn) || cn.includes(u);
  });
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
 *  postalpincode.in dataset.
 *
 *  Failure modes:
 *    - Network error / API offline → fail OPEN (don't block real users
 *      on a transient blip; UI-side autofill gave them a hint already)
 *    - Pincode exists in dataset but city/state don't match → fail closed
 *      with the spec-mandated mismatch message
 *    - Pincode genuinely not in dataset (e.g. "999999") → fail CLOSED
 *      with "Invalid pincode." — surfaced during BUG-053 retest where
 *      pincode "000000" was passing because we treated empty dataset as
 *      a network error and let the create through.
 *
 *  Pass `requireAll = true` to insist all three fields are present
 *  (Add/Edit forms where address is mandatory). Pass false to skip
 *  validation when pincode is missing (optional-pincode flows like
 *  the buyer enquiry pincode field).
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
    // Network error — fail open.
    return { valid: true };
  }
  if (!mapping.found) {
    // Pincode is structurally 6 digits but doesn't exist in the dataset.
    // Fail closed — this is the "000000" / "999999" case retest exposed.
    return { valid: false, reason: 'Invalid pincode.' };
  }
  // City match: accept against any post-office entry, with loose
  // substring tolerance. Fixes the "Delhi vs New Delhi" false positive.
  if (city && !looseMatchAny(city, mapping.districts)) {
    return {
      valid: false,
      reason: 'Entered Pincode does not match with the selected City and State.',
      canonicalCity: mapping.canonicalCity,
      canonicalState: mapping.canonicalState,
    };
  }
  if (state && !looseMatchAny(state, mapping.states)) {
    return {
      valid: false,
      reason: 'Entered Pincode does not match with the selected City and State.',
      canonicalCity: mapping.canonicalCity,
      canonicalState: mapping.canonicalState,
    };
  }
  return {
    valid: true,
    canonicalCity: mapping.canonicalCity,
    canonicalState: mapping.canonicalState,
  };
}
