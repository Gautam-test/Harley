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
  colour: string;
  engine: string;
}

const PROFILES: Array<{ match: RegExp; profile: MockProfile }> = [
  {
    match: /^1HD/,
    profile: {
      modelFamily: 'Grand American Touring',
      modelName: 'Street Glide Special',
      colour: 'Vivid Black',
      engine: 'Milwaukee-Eight 114 · 1868 cc',
    },
  },
  {
    match: /^MEG/,
    profile: {
      modelFamily: 'Sport',
      modelName: 'Sportster S',
      colour: 'Vivid Black',
      engine: 'Revolution Max 1250T · 1252 cc',
    },
  },
];

const DEFAULT_PROFILE: MockProfile = {
  modelFamily: 'Cruiser',
  modelName: 'Fat Boy 114',
  colour: 'Vivid Black',
  engine: 'Milwaukee-Eight 114 · 1868 cc',
};

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
    const profile = PROFILES.find((p) => p.match.test(vin))?.profile ?? DEFAULT_PROFILE;
    const year = decodeVinYear(vin);
    return {
      vin,
      engine: profile.engine,
      modelName: profile.modelName,
      modelFamily: profile.modelFamily,
      colour: profile.colour,
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
