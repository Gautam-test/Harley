// Browser-side reverse geocoding — coordinates → { state, city, locality, pincode }.
//
// Uses BigDataCloud's free `reverse-geocode-client` endpoint which is designed
// for browser use, has CORS enabled, and doesn't require an API key. Other
// adapters (Google Geocoding, Nominatim) can plug in here later by branching
// on env.
//
// We map BigDataCloud's `principalSubdivision` and `city` strings to our
// canonical India geo dataset (`indiaGeo.ts`) so the values land cleanly on
// the dependent State + City dropdowns.

import { INDIA_STATES, citiesForState } from './indiaGeo';

const REVERSE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

interface BigDataCloudResponse {
  countryCode?: string;
  countryName?: string;
  principalSubdivision?: string;
  principalSubdivisionCode?: string;
  city?: string;
  locality?: string;
  postcode?: string;
  localityInfo?: {
    administrative?: { name: string; description?: string; order?: number }[];
  };
}

export interface ReverseGeocodeResult {
  /** ISO 2-letter country, e.g. "IN". Always present. */
  countryCode: string;
  /** Resolved Indian state (matched to our canonical INDIA_STATES list). */
  state: string | null;
  /** Resolved city (matched to citiesForState). May be null if no match. */
  city: string | null;
  /** Free-text locality (typically a neighbourhood or sub-district). */
  locality: string;
  /** 6-digit pincode if BigDataCloud could resolve one. */
  pincode: string | null;
}

// Common state-name aliases. BigDataCloud sometimes uses the older spelling.
const STATE_ALIASES: Record<string, string> = {
  'national capital territory of delhi': 'Delhi',
  'nct of delhi': 'Delhi',
  'delhi (ut)': 'Delhi',
  'pondicherry': 'Puducherry',
  'orissa': 'Odisha',
  'uttaranchal': 'Uttarakhand',
  'jammu and kashmir': 'Jammu & Kashmir',
  'andaman and nicobar islands': 'Andaman & Nicobar Islands',
  'dadra and nagar haveli and daman and diu': 'Dadra & Nagar Haveli and Daman & Diu',
  'dadra and nagar haveli': 'Dadra & Nagar Haveli and Daman & Diu',
  'daman and diu': 'Dadra & Nagar Haveli and Daman & Diu',
};

// City-name aliases — BigDataCloud often returns the official renamed form
// (Gurugram, Bengaluru); our dropdown still uses the colloquial form.
const CITY_ALIASES: Record<string, string> = {
  gurugram: 'Gurgaon',
  bengaluru: 'Bengaluru',
  bangalore: 'Bengaluru',
  bombay: 'Mumbai',
  madras: 'Chennai',
  calcutta: 'Kolkata',
  mysore: 'Mysuru',
  trivandrum: 'Thiruvananthapuram',
  pondicherry: 'Puducherry',
};

function matchState(rawState: string | undefined): string | null {
  if (!rawState) return null;
  const trimmed = rawState.trim();
  // Exact match (case-insensitive) on our canonical list.
  const direct = INDIA_STATES.find(
    (s) => s.toLowerCase() === trimmed.toLowerCase(),
  );
  if (direct) return direct;
  // Alias lookup.
  const aliased = STATE_ALIASES[trimmed.toLowerCase()];
  if (aliased) return aliased;
  // Last-ditch: partial-startsWith match (handles trailing notes like
  // "Karnataka (state)").
  const partial = INDIA_STATES.find(
    (s) =>
      s.toLowerCase().startsWith(trimmed.toLowerCase()) ||
      trimmed.toLowerCase().startsWith(s.toLowerCase()),
  );
  return partial ?? null;
}

function matchCity(state: string, rawCity: string | undefined, locality: string): string | null {
  const cities = citiesForState(state);
  if (cities.length === 0) return null;
  // Try city, then locality, then aliased forms of each.
  const candidates = [rawCity, locality]
    .filter((c): c is string => Boolean(c?.trim()))
    .map((c) => c.trim());
  for (const cand of candidates) {
    const direct = cities.find((c) => c.toLowerCase() === cand.toLowerCase());
    if (direct) return direct;
    const aliased = CITY_ALIASES[cand.toLowerCase()];
    if (aliased && cities.includes(aliased)) return aliased;
  }
  return null;
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult> {
  const url = `${REVERSE_URL}?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Reverse geocode failed (HTTP ${res.status})`);
  }
  const body = (await res.json()) as BigDataCloudResponse;

  const countryCode = body.countryCode ?? '';
  // We only resolve to our state/city dropdowns for India. Other countries
  // still get a locality string back so the form's free-text Location
  // field can show something useful.
  const isIndia = countryCode.toUpperCase() === 'IN';
  const state = isIndia ? matchState(body.principalSubdivision) : null;
  const city =
    state ? matchCity(state, body.city, body.locality ?? '') : null;
  // Prefer the most specific locality string we have.
  const locality =
    body.locality ||
    body.city ||
    body.principalSubdivision ||
    body.countryName ||
    '';
  const pincode = body.postcode && /^\d{6}$/.test(body.postcode) ? body.postcode : null;

  return {
    countryCode: countryCode.toUpperCase(),
    state,
    city,
    locality,
    pincode,
  };
}
