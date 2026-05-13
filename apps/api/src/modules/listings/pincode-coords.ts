// Indian PIN-code → approximate (lat, lng) lookup.
//
// India's PIN codes are organised by 9 regions; the first digit gives the
// region, the next two narrow it to a sub-region (state/zone). We don't need
// per-pincode precision for "show bikes within 50 km of buyer" — the centroid
// of the sub-region is good enough for the dealer-radius filter and avoids a
// runtime dependency on an external geocoder API.
//
// Lookup is layered:
//   1. 3-digit prefix → exact city centroid (the PREFIX_MAP below).
//   2. 1-digit region fallback → regional metro centroid (REGION_MAP).
// The fallback exists so that any well-formed 6-digit pincode resolves to
// SOMETHING — without it, an unmapped pincode caused the API filter to
// silently no-op and the buyer perceived "search by pincode does nothing".
// The caller receives `{ match: 'exact' | 'region' | 'invalid' }` so the
// SPA can tell the buyer when results are an approximation.

interface Coord {
  lat: number;
  lng: number;
  city: string;
}

const PREFIX_MAP: Record<string, Coord> = {
  // ─── North (1) ───
  '110': { lat: 28.6139, lng: 77.2090, city: 'New Delhi' },
  '111': { lat: 28.6139, lng: 77.2090, city: 'New Delhi' },
  '112': { lat: 28.7041, lng: 77.1025, city: 'North Delhi' },
  '120': { lat: 28.5355, lng: 77.3910, city: 'Noida' },
  '121': { lat: 28.4089, lng: 77.3178, city: 'Faridabad' },
  '122': { lat: 28.4595, lng: 77.0266, city: 'Gurgaon' }, // Capital H-D Gurgaon
  '124': { lat: 28.8955, lng: 76.6066, city: 'Rohtak' },
  '125': { lat: 29.1492, lng: 75.7217, city: 'Hisar' },
  '131': { lat: 28.9931, lng: 77.0151, city: 'Sonipat' },
  '140': { lat: 30.7333, lng: 76.7794, city: 'Chandigarh' },
  '141': { lat: 30.9010, lng: 75.8573, city: 'Ludhiana' },
  '143': { lat: 31.6340, lng: 74.8723, city: 'Amritsar' },
  '160': { lat: 30.7333, lng: 76.7794, city: 'Chandigarh' },
  '171': { lat: 31.1048, lng: 77.1734, city: 'Shimla' },
  '180': { lat: 32.7266, lng: 74.8570, city: 'Jammu' },
  '190': { lat: 34.0837, lng: 74.7973, city: 'Srinagar' },

  // ─── North (2) — UP / Uttarakhand ───
  '201': { lat: 28.6692, lng: 77.4538, city: 'Ghaziabad' },
  '208': { lat: 26.4499, lng: 80.3319, city: 'Kanpur' },
  '226': { lat: 26.8467, lng: 80.9462, city: 'Lucknow' },
  '221': { lat: 25.3176, lng: 82.9739, city: 'Varanasi' },
  '243': { lat: 28.3670, lng: 79.4304, city: 'Bareilly' },
  '248': { lat: 30.3165, lng: 78.0322, city: 'Dehradun' },
  '250': { lat: 28.9845, lng: 77.7064, city: 'Meerut' },
  '282': { lat: 27.1767, lng: 78.0081, city: 'Agra' },

  // ─── West (3) — Rajasthan ───
  '301': { lat: 28.4089, lng: 76.9772, city: 'Alwar' },
  '302': { lat: 26.9124, lng: 75.7873, city: 'Jaipur' },
  '305': { lat: 26.4499, lng: 74.6399, city: 'Ajmer' },
  '313': { lat: 24.5854, lng: 73.7125, city: 'Udaipur' },
  '324': { lat: 25.2138, lng: 75.8648, city: 'Kota' },
  '342': { lat: 26.2389, lng: 73.0243, city: 'Jodhpur' },
  '380': { lat: 23.0225, lng: 72.5714, city: 'Ahmedabad' }, // Gujarat starts here
  '390': { lat: 22.3072, lng: 73.1812, city: 'Vadodara' },
  '395': { lat: 21.1702, lng: 72.8311, city: 'Surat' },

  // ─── West (4) — Maharashtra / Goa ───
  '400': { lat: 19.0760, lng: 72.8777, city: 'Mumbai' }, // Seven Islands H-D Mumbai
  '401': { lat: 19.4520, lng: 72.7995, city: 'Vasai' },
  '410': { lat: 19.2403, lng: 73.1305, city: 'Navi Mumbai' },
  '411': { lat: 18.5204, lng: 73.8567, city: 'Pune' },
  '413': { lat: 17.6599, lng: 75.9064, city: 'Solapur' },
  '422': { lat: 19.9975, lng: 73.7898, city: 'Nashik' },
  '440': { lat: 21.1458, lng: 79.0882, city: 'Nagpur' },
  '452': { lat: 22.7196, lng: 75.8577, city: 'Indore' },
  '462': { lat: 23.2599, lng: 77.4126, city: 'Bhopal' },
  '482': { lat: 23.1815, lng: 79.9864, city: 'Jabalpur' },
  '492': { lat: 21.2514, lng: 81.6296, city: 'Raipur' },

  // ─── South (5) — AP / Karnataka ───
  '500': { lat: 17.3850, lng: 78.4867, city: 'Hyderabad' },
  '517': { lat: 13.6288, lng: 79.4192, city: 'Tirupati' },
  '520': { lat: 16.5062, lng: 80.6480, city: 'Vijayawada' },
  '530': { lat: 17.6868, lng: 83.2185, city: 'Visakhapatnam' },
  '560': { lat: 12.9716, lng: 77.5946, city: 'Bengaluru' },
  '570': { lat: 12.2958, lng: 76.6394, city: 'Mysore' },
  '580': { lat: 15.3173, lng: 75.7139, city: 'Hubballi' },
  '590': { lat: 15.8497, lng: 74.4977, city: 'Belagavi' },

  // ─── South (6) — Kerala / Tamil Nadu ───
  '600': { lat: 13.0827, lng: 80.2707, city: 'Chennai' },
  '620': { lat: 10.7905, lng: 78.7047, city: 'Tiruchirappalli' },
  '625': { lat: 9.9252, lng: 78.1198, city: 'Madurai' },
  '641': { lat: 11.0168, lng: 76.9558, city: 'Coimbatore' },
  '673': { lat: 11.2588, lng: 75.7804, city: 'Kozhikode' },
  '682': { lat: 9.9312, lng: 76.2673, city: 'Kochi' },
  '695': { lat: 8.5241, lng: 76.9366, city: 'Thiruvananthapuram' },

  // ─── East (7) — WB / Odisha / NE ───
  '700': { lat: 22.5726, lng: 88.3639, city: 'Kolkata' },
  '711': { lat: 22.5726, lng: 88.3639, city: 'Howrah' },
  '751': { lat: 20.2961, lng: 85.8245, city: 'Bhubaneswar' },
  '781': { lat: 26.1445, lng: 91.7362, city: 'Guwahati' },

  // ─── East (8) — Bihar / Jharkhand ───
  '800': { lat: 25.5941, lng: 85.1376, city: 'Patna' },
  '831': { lat: 22.8046, lng: 86.2029, city: 'Jamshedpur' },
  '834': { lat: 23.3441, lng: 85.3096, city: 'Ranchi' },
};

// Region centroids — the 1-digit fallback when the 3-digit prefix isn't
// in PREFIX_MAP. India's PIN system uses digit 1 for the postal region:
// 1=North, 2=North-UP, 3=West-Raj/Guj, 4=West-MH/MP/CG, 5=South-AP/KA,
// 6=South-KL/TN, 7=East-WB/OR/NE, 8=East-BR/JH, 9=APO/FPO. Each centroid
// is the largest city in that region. Coarse — a buyer in interior
// Tripura gets distances measured from Kolkata — but it means EVERY
// well-formed pincode resolves to *something* and the radius filter
// actually fires. The response tells the SPA when this approximate path
// was taken so the buyer can be told "showing approximate results".
const REGION_MAP: Record<string, Coord> = {
  '1': { lat: 28.6139, lng: 77.2090, city: 'New Delhi' },
  '2': { lat: 26.8467, lng: 80.9462, city: 'Lucknow' },
  '3': { lat: 26.9124, lng: 75.7873, city: 'Jaipur' },
  '4': { lat: 19.0760, lng: 72.8777, city: 'Mumbai' },
  '5': { lat: 17.3850, lng: 78.4867, city: 'Hyderabad' },
  '6': { lat: 13.0827, lng: 80.2707, city: 'Chennai' },
  '7': { lat: 22.5726, lng: 88.3639, city: 'Kolkata' },
  '8': { lat: 25.5941, lng: 85.1376, city: 'Patna' },
  '9': { lat: 28.6139, lng: 77.2090, city: 'New Delhi' }, // APO/FPO — Delhi default
};

export type PincodeMatch = 'exact' | 'region' | 'invalid';

export type PincodeLookup =
  | { coord: Coord; match: 'exact' | 'region' }
  | { coord: null; match: 'invalid' };

export function pincodeCoord(pincode: string): PincodeLookup {
  if (!/^\d{6}$/.test(pincode)) return { coord: null, match: 'invalid' };
  const exact = PREFIX_MAP[pincode.slice(0, 3)];
  if (exact) return { coord: exact, match: 'exact' };
  const region = REGION_MAP[pincode[0] as string];
  if (region) return { coord: region, match: 'region' };
  return { coord: null, match: 'invalid' };
}

// Haversine — great-circle distance between two lat/lng points, in km.
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const aa = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(aa));
}
