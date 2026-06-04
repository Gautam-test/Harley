import type { TorqueClient, TorqueVehicle, TorqueCpoKit } from './types.js';

// In-memory deterministic mock — unblocks Sprint 2 listing flow before the real
// Torque API spec arrives. Accepts any well-formed VIN (17 chars, no I/O/Q)
// and returns a fabricated vehicle. Real H-D VINs starting with "1HD" get a
// touring profile; everything else gets a sensible default so dealers can test
// the wizard with placeholder VINs.
//
// Returns the seven canonical Torque data fields confirmed by the H-D ops
// team: VIN, ENGINE, MODEL NAME, MODEL FAMILY, COLOR, CUSTOMER NAME, DATE OF
// INVOICE — plus the operational `dealerId` + `status`.
// Allow all alphanumeric for demo/testing (standard excludes I/O/Q).
const VIN_FORMAT = /^[A-Z0-9]{17}$/;

interface MockProfile {
  modelFamily: string;
  modelName: string;
  engine: string;
}

// QA: until the real Torque DMS is live, dealers test the Add Listing
// wizard with random VINs and need to see a *different* bike each time
// rather than the same Fat Boy 114 on every fetch. The pool below
// covers a representative slice of the H-D India lineup — model name,
// family + engine kept consistent per row. Selection is hash-based so
// the same VIN always returns the same bike (edit flow re-fetches with
// the same VIN and must show the same data).
const PROFILES: MockProfile[] = [
  { modelFamily: 'Grand American Touring', modelName: 'Street Glide Special', engine: 'Milwaukee-Eight 114 · 1868 cc' },
  { modelFamily: 'Grand American Touring', modelName: 'Road Glide Special',   engine: 'Milwaukee-Eight 114 · 1868 cc' },
  { modelFamily: 'Grand American Touring', modelName: 'Road King Special',    engine: 'Milwaukee-Eight 114 · 1868 cc' },
  { modelFamily: 'Grand American Touring', modelName: 'CVO Road Glide',       engine: 'Milwaukee-Eight 121 · 1977 cc' },
  { modelFamily: 'Cruiser',                modelName: 'Fat Boy 114',          engine: 'Milwaukee-Eight 114 · 1868 cc' },
  { modelFamily: 'Cruiser',                modelName: 'Heritage Classic',     engine: 'Milwaukee-Eight 114 · 1868 cc' },
  { modelFamily: 'Cruiser',                modelName: 'Low Rider S',          engine: 'Milwaukee-Eight 117 · 1923 cc' },
  { modelFamily: 'Cruiser',                modelName: 'Breakout 117',         engine: 'Milwaukee-Eight 117 · 1923 cc' },
  { modelFamily: 'Cruiser',                modelName: 'Street Bob 114',       engine: 'Milwaukee-Eight 114 · 1868 cc' },
  { modelFamily: 'Cruiser',                modelName: 'Fat Bob 114',          engine: 'Milwaukee-Eight 114 · 1868 cc' },
  { modelFamily: 'Sport',                  modelName: 'Sportster S',          engine: 'Revolution Max 1250T · 1252 cc' },
  { modelFamily: 'Sport',                  modelName: 'Nightster',            engine: 'Revolution Max 975T · 975 cc' },
  { modelFamily: 'Sport',                  modelName: 'Iron 883',             engine: 'Evolution 883 · 883 cc' },
  { modelFamily: 'Sport',                  modelName: 'Forty-Eight',          engine: 'Evolution 1200 · 1202 cc' },
  { modelFamily: 'Adventure Touring',      modelName: 'Pan America 1250 Special', engine: 'Revolution Max 1250 · 1252 cc' },
  { modelFamily: 'Street',                 modelName: 'X 440',                engine: 'Single-cylinder 440 · 440 cc' },
];

const COLOURS = [
  'Vivid Black',
  'River Rock Gray',
  'Heirloom Red',
  'Tobacco Fade',
  'Snake Venom',
  'Bright Billiard Blue',
  'Atlas Silver Metallic',
  'Industrial Yellow',
  'White Sand Pearl',
  'Baja Orange',
];

// Stable hash of the full VIN → integer. Avoids Math.random so the same
// VIN keyed twice (e.g. edit-then-resave) yields identical data.
function hashVin(vin: string): number {
  let h = 0;
  for (let i = 0; i < vin.length; i++) h = (h * 31 + vin.charCodeAt(i)) >>> 0;
  return h;
}
function pickProfile(vin: string): MockProfile {
  return PROFILES[hashVin(vin) % PROFILES.length] ?? PROFILES[0]!;
}
function pickColour(vin: string): string {
  // Different seed (reverse VIN) so colour varies independently of model.
  return COLOURS[hashVin(vin.split('').reverse().join('')) % COLOURS.length] ?? 'Vivid Black';
}

// Deterministic mock customer name + invoice date — keyed off the last 4 of
// the VIN so reruns with the same VIN return identical data.
const MOCK_CUSTOMERS = [
  'Anil Kapoor',
  'Riya Sharma',
  'Vikram Mehta',
  'Priya Desai',
  'Rohan Saxena',
  'Sneha Iyer',
  'Arjun Singh',
  'Meera Pillai',
];
function customerFor(vin: string): string {
  const seed = parseInt(vin.slice(-4), 36) || 0;
  return MOCK_CUSTOMERS[seed % MOCK_CUSTOMERS.length] ?? 'H-D Customer';
}

// Mock invoice date — VIN's 10th char tells us the model year (1980-cycle or
// 2010-cycle). We anchor invoice date to a plausible point a few months after
// year-of-manufacture using the last 2 chars of VIN as deterministic offset.
function invoiceDateFor(vin: string, year: number): string {
  const monthSeed = parseInt(vin.slice(-2), 36) || 0;
  const month = (monthSeed % 12) + 1; // 1-12
  const day = ((parseInt(vin.slice(-3, -2), 36) || 0) % 27) + 1; // 1-27
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Decode the VIN's 10th character into a model year. The encoding repeats
// every 30 years (A-Y skipping I/O/Q/U/Z, then 1-9), so we pick the most
// recent occurrence ≤ current year.
//
//   A=1980/2010, B=1981/2011, ..., Y=2000/2030,
//   1=2001/2031, 2=2002/2032, ..., 9=2009/2039
function decodeVinYear(vin: string): number {
  const ch = vin[9]?.toUpperCase() ?? '';
  const cycle = 'ABCDEFGHJKLMNPRSTVWXY123456789'; // skip I/O/Q/U/Z
  const idx = cycle.indexOf(ch);
  if (idx < 0) return new Date().getUTCFullYear();
  // Cycle starts at 1980. Each character represents one year.
  const base = 1980 + idx;
  const now = new Date().getUTCFullYear();
  // Pick the most recent occurrence ≤ now (ie. 1980 cycle vs 2010 cycle).
  let year = base;
  while (year + 30 <= now) year += 30;
  return year;
}

export class TorqueMockClient implements TorqueClient {
  private status = new Map<string, TorqueVehicle['status']>();

  async getVehicleByVin(vin: string): Promise<TorqueVehicle | null> {
    if (!VIN_FORMAT.test(vin)) return null;
    const profile = pickProfile(vin);
    const year = decodeVinYear(vin);
    return {
      vin,
      engine: profile.engine,
      modelName: profile.modelName,
      modelFamily: profile.modelFamily,
      colour: pickColour(vin),
      customerName: customerFor(vin),
      dateOfInvoice: invoiceDateFor(vin, year),
      dealerId: `TQ-DEALER-${vin.slice(-4)}`,
      status: this.status.get(vin) ?? 'AVAILABLE',
    };
  }

  async getCpoKit(vin: string): Promise<TorqueCpoKit> {
    if (!VIN_FORMAT.test(vin)) return {};
    // Point at the mock-doc PDF generator on our own API rather than the
    // literal hostname `torque.mock` (which DNS doesn't resolve, leaving
    // the dealer wizard with non-clickable buttons that returned "site
    // can't be reached" — QA bug 7). The live Torque client overrides
    // this with the real signed-URLs from the DMS.
    const base = '/api/v1/torque/mock-docs';
    return {
      cpoCertUrl: `${base}/cpo-cert/${vin}.pdf`,
      rsaUrl: `${base}/rsa/${vin}.pdf`,
      espUrl: `${base}/esp/${vin}.pdf`,
      serviceHistoryUrl: `${base}/service-history/${vin}.pdf`,
      rcUrl: `${base}/rc/${vin}.pdf`,
      deliveryNoteUrl: `${base}/delivery-note/${vin}.pdf`,
      hogUrl: `${base}/hog-membership/${vin}.pdf`,
      insuranceUrl: `${base}/insurance/${vin}.pdf`,
    };
  }

  async pushInspectionReport(_vin: string, _pdfUrl: string): Promise<void> {
    // no-op for mock
  }

  async updateVehicleStatus(vin: string, status: TorqueVehicle['status']): Promise<void> {
    this.status.set(vin, status);
  }
}
