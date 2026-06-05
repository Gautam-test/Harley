// Browser-side reverse geocoding for the dealer Log Enquiry modals.
// Coordinates → { state, city, locality, pincode } via BigDataCloud's
// free reverse-geocode-client endpoint (CORS-enabled, no API key).
//
// Slimmer variant of apps/web-buyer/src/lib/reverseGeocode.ts — the
// dealer form uses free-text City + State Select inputs (not a
// canonical dataset), so we return the API's raw strings after
// minor alias normalisation. Auto-fill writes whatever comes back
// directly into the form fields; the dealer rep can correct it.

const REVERSE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

interface BigDataCloudResponse {
  countryCode?: string;
  countryName?: string;
  principalSubdivision?: string;
  city?: string;
  locality?: string;
  postcode?: string;
}

export interface ReverseGeocodeResult {
  countryCode: string;
  /** Indian state name (renamed forms collapsed via STATE_ALIASES). */
  state: string;
  /** Most-specific city (BigDataCloud often returns the renamed form;
   *  we collapse aliases to match what the dealer dropdown uses). */
  city: string;
  /** Free-text neighbourhood / locality string for the "Location" input. */
  locality: string;
  /** 6-digit pincode if BigDataCloud could resolve one. */
  pincode: string;
}

const STATE_ALIASES: Record<string, string> = {
  'national capital territory of delhi': 'Delhi',
  'nct of delhi': 'Delhi',
  'delhi (ut)': 'Delhi',
  pondicherry: 'Puducherry',
  orissa: 'Odisha',
  uttaranchal: 'Uttarakhand',
  'jammu and kashmir': 'Jammu & Kashmir',
  'andaman and nicobar islands': 'Andaman & Nicobar Islands',
  'dadra and nagar haveli and daman and diu': 'Dadra & Nagar Haveli and Daman & Diu',
  'dadra and nagar haveli': 'Dadra & Nagar Haveli and Daman & Diu',
  'daman and diu': 'Dadra & Nagar Haveli and Daman & Diu',
};

const CITY_ALIASES: Record<string, string> = {
  gurugram: 'Gurgaon',
  bombay: 'Mumbai',
  madras: 'Chennai',
  calcutta: 'Kolkata',
  mysore: 'Mysuru',
  trivandrum: 'Thiruvananthapuram',
  pondicherry: 'Puducherry',
};

function normalise(map: Record<string, string>, raw: string | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  return map[trimmed.toLowerCase()] ?? trimmed;
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
  const state = normalise(STATE_ALIASES, body.principalSubdivision);
  const city = normalise(CITY_ALIASES, body.city);
  const locality =
    body.locality || body.city || body.principalSubdivision || body.countryName || '';
  const pincode = body.postcode && /^\d{6}$/.test(body.postcode) ? body.postcode : '';
  return {
    countryCode: (body.countryCode ?? '').toUpperCase(),
    state,
    city,
    locality,
    pincode,
  };
}
