// Torque DMS contract — finalised once the client provides the API spec
// (PRD Open Question 8). The shape below reflects what the marketplace needs;
// the live client will adapt the upstream payloads to this canonical form.

// Canonical vehicle payload Torque DMS returns for a VIN. The seven business
// fields are confirmed by the H-D operations team (2026-05-06):
//
//   1. VIN
//   2. ENGINE             (engine identifier / displacement / variant)
//   3. MODEL NAME
//   4. MODEL FAMILY
//   5. COLOR              (named in our codebase as `colour`)
//   6. CUSTOMER NAME      (previous owner — PII, dealer-side only)
//   7. DATE OF INVOICE    (original sale invoice date, ISO 8601)
//
// The remaining fields (`dealerId`, `status`) are operational metadata that
// Torque emits alongside the business data; they are not part of the seven
// "data" fields shown to dealers.
//
// Manufacturing year is intentionally NOT in this contract — it is derived
// server-side from the VIN's 10th character at listing-create time
// (see apps/api/src/utils/vinYear.ts).
export interface TorqueVehicle {
  vin: string;
  engine: string;
  modelName: string;
  modelFamily: string;
  colour: string;
  customerName: string;
  /** ISO 8601 date string, e.g. "2023-04-12". */
  dateOfInvoice: string;
  // ─── Operational metadata (not part of the "7 data fields") ─────
  dealerId: string;
  status: 'AVAILABLE' | 'SOLD' | 'IN_STOCK';
}

export interface TorqueCpoKit {
  cpoCertUrl?: string;
  rsaUrl?: string;
  espUrl?: string;
  serviceHistoryUrl?: string;
  rcUrl?: string;
  deliveryNoteUrl?: string;
  hogUrl?: string;
  /** Vehicle insurance certificate, e.g. policy PDF from the previous owner. */
  insuranceUrl?: string;
}

export interface TorqueClient {
  /** PRD §7.1 Pull — Get vehicle by VIN. */
  getVehicleByVin(vin: string): Promise<TorqueVehicle | null>;

  /** PRD §7.1 Pull — Get CPO kit docs. */
  getCpoKit(vin: string): Promise<TorqueCpoKit>;

  /** PRD §7.1 Push — Sync inspection PDF after dealer upload. */
  pushInspectionReport(vin: string, pdfUrl: string): Promise<void>;

  /** PRD §7.1 Push — Sync vehicle status (Available/Sold). */
  updateVehicleStatus(vin: string, status: TorqueVehicle['status']): Promise<void>;
}

export class TorqueUnavailableError extends Error {
  constructor(message = 'Torque DMS is unavailable') {
    super(message);
    this.name = 'TorqueUnavailableError';
  }
}
