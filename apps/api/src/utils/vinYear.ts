// VIN model-year decoder. Industry-standard 17-char VINs encode the model
// year at position 10. The encoding repeats every 30 years, so we pick the
// most recent occurrence ≤ current year.
//
// Used by the listing-create flow to derive a year when the Torque payload
// doesn't include one (Torque's seven canonical fields are VIN, ENGINE,
// MODEL NAME, MODEL FAMILY, COLOR, CUSTOMER NAME, DATE OF INVOICE — year
// is implied by VIN).
const YEAR_CYCLE = 'ABCDEFGHJKLMNPRSTVWXY123456789'; // skip I/O/Q/U/Z

/**
 * Returns the most recent model year encoded by the VIN's 10th character,
 * never exceeding the current calendar year + 1 (allowing for next-year-
 * model-released-in-Q4 edge cases).
 *
 * @throws Error when the VIN's 10th character is not a valid year code.
 */
export function decodeVinYear(vin: string): number {
  if (!vin || vin.length < 10) {
    throw new Error('VIN must be at least 10 characters');
  }
  const ch = vin[9]?.toUpperCase() ?? '';
  const idx = YEAR_CYCLE.indexOf(ch);
  if (idx < 0) {
    throw new Error(`Invalid VIN year code "${ch}" at position 10`);
  }
  const base = 1980 + idx;
  const ceiling = new Date().getUTCFullYear() + 1;
  let year = base;
  while (year + 30 <= ceiling) year += 30;
  return year;
}
