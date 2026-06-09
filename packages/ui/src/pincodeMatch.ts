// Real-time pincode ↔ city ↔ state validation helper. Shared by every
// address form across buyer / dealer / admin SPAs so that users see the
// "Entered Pincode does not match" error inline as they fill the form,
// without waiting for the server-side rejection on submit (BUG-053/055).
//
// Network: hits postalpincode.in (free, CORS-enabled, no key). One call
// per unique pincode in a 30-min in-memory cache so re-renders don't
// thrash the network. Times out after 4 s and silently fails open (no
// error shown) so a transient blip doesn't block the user — they'll
// still get the authoritative server rejection on submit.

export interface PincodePostOffice {
  district: string;
  state: string;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const cache = new Map<string, { entries: PincodePostOffice[]; fetchedAt: number }>();
const inflight = new Map<string, Promise<PincodePostOffice[] | null>>();

/** Returns every (district, state) tuple for the given 6-digit Indian
 *  pincode, OR null on lookup failure / structurally-invalid input.
 *  Caller decides what to do with null (fail open vs surface generic
 *  "invalid pincode" copy). */
export async function lookupPincode(pincode: string): Promise<PincodePostOffice[] | null> {
  if (!/^[1-9][0-9]{5}$/.test(pincode)) return null;
  const cached = cache.get(pincode);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.entries;
  }
  // De-dupe concurrent requests for the same pincode (e.g. two forms
  // open simultaneously, or a re-render triggers a second fetch before
  // the first resolves).
  const existing = inflight.get(pincode);
  if (existing) return existing;
  const promise = (async (): Promise<PincodePostOffice[] | null> => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) return null;
      const json = (await res.json()) as Array<{
        Status: string;
        PostOffice?: Array<{ District: string; State: string }>;
      }>;
      const pos = json?.[0]?.PostOffice ?? [];
      const entries: PincodePostOffice[] = pos.map((p) => ({
        district: p.District,
        state: p.State,
      }));
      cache.set(pincode, { entries, fetchedAt: Date.now() });
      return entries;
    } catch {
      return null;
    } finally {
      inflight.delete(pincode);
    }
  })();
  inflight.set(pincode, promise);
  return promise;
}

/** Loose case-insensitive match. Accepts the user value if it equals
 *  any canonical entry OR if either string contains the other (handles
 *  "Delhi" vs "New Delhi" vs "Central Delhi" without false-positives). */
function looseMatchAny(user: string, canonicals: string[]): boolean {
  const u = user.trim().toLowerCase();
  if (!u) return false;
  return canonicals.some((c) => {
    const cn = c.trim().toLowerCase();
    return u === cn || u.includes(cn) || cn.includes(u);
  });
}

export interface PincodeCheckOpts {
  pincode: string;
  city?: string;
  state?: string;
}

export interface PincodeCheckResult {
  /** "ok" — trio is consistent (or trio incomplete / lookup failed
   *  and we're failing open). "mismatch" — city/state don't match the
   *  pincode's dataset. "invalid" — pincode is structurally bad
   *  (000000, 7-digit, letters etc.) or genuinely not in the dataset. */
  status: 'ok' | 'mismatch' | 'invalid' | 'pending';
  /** Spec-mandated copy when status === 'mismatch' or 'invalid'. */
  error?: string;
  /** Canonical city / state from the dataset — useful for showing a
   *  "did you mean X?" hint or for auto-filling. */
  canonicalCity?: string;
  canonicalState?: string;
}

/** Check if the supplied (pincode, city, state) trio is internally
 *  consistent. Designed for form-blur use: only fires when pincode is
 *  6 digits and city/state are non-empty. Returns 'ok' (no error to
 *  show) in every other case so partial-form-state doesn't surface
 *  false errors. */
export async function checkPincodeMatch(opts: PincodeCheckOpts): Promise<PincodeCheckResult> {
  const { pincode, city, state } = opts;
  // Don't fire on incomplete input — saves API calls + avoids confusing
  // intermediate errors. Server-side validator is the authoritative gate.
  if (!pincode) return { status: 'ok' };
  if (!/^[1-9][0-9]{5}$/.test(pincode)) {
    return {
      status: 'invalid',
      error: 'Pincode must be 6 digits and cannot start with 0.',
    };
  }
  if (!city && !state) return { status: 'ok' };
  const entries = await lookupPincode(pincode);
  if (entries === null) return { status: 'ok' };           // network blip — fail open
  if (entries.length === 0) {                              // pincode not in dataset
    return { status: 'invalid', error: 'Invalid pincode.' };
  }
  const districts = entries.map((e) => e.district);
  const states = entries.map((e) => e.state);
  if (city && !looseMatchAny(city, districts)) {
    return {
      status: 'mismatch',
      error: 'Entered Pincode does not match with the selected City and State.',
      canonicalCity: entries[0]!.district,
      canonicalState: entries[0]!.state,
    };
  }
  if (state && !looseMatchAny(state, states)) {
    return {
      status: 'mismatch',
      error: 'Entered Pincode does not match with the selected City and State.',
      canonicalCity: entries[0]!.district,
      canonicalState: entries[0]!.state,
    };
  }
  return {
    status: 'ok',
    canonicalCity: entries[0]!.district,
    canonicalState: entries[0]!.state,
  };
}
