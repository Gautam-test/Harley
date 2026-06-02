// Browser-side reverse geocoding — coordinates → city / state / pincode.
// Uses BigDataCloud's free `reverse-geocode-client` endpoint (CORS-enabled,
// no API key). Admin uses free-text inputs so we skip the canonical-list
// matching that the buyer side does.

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
  state: string | null;
  city: string | null;
  locality: string;
  pincode: string | null;
}

// City-name aliases — BigDataCloud returns the official renamed form
// (Gurugram, Bengaluru); the dealer DB typically uses the colloquial form.
const CITY_ALIASES: Record<string, string> = {
  Gurugram: 'Gurgaon',
  Bombay: 'Mumbai',
  Madras: 'Chennai',
  Calcutta: 'Kolkata',
  Mysore: 'Mysuru',
  Trivandrum: 'Thiruvananthapuram',
  Pondicherry: 'Puducherry',
};

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult> {
  const url = `${REVERSE_URL}?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Reverse geocode failed (HTTP ${res.status})`);
  const body = (await res.json()) as BigDataCloudResponse;

  const countryCode = (body.countryCode ?? '').toUpperCase();
  const rawCity = body.city ?? body.locality ?? null;
  const city = rawCity ? (CITY_ALIASES[rawCity] ?? rawCity) : null;
  const state = body.principalSubdivision ?? null;
  const locality = body.locality || body.city || '';
  const pincode = body.postcode && /^\d{6}$/.test(body.postcode) ? body.postcode : null;

  return { countryCode, state, city, locality, pincode };
}
