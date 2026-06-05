// Validation rule library for the dealer portal's enquiry-creation
// forms. Mirrors the buyer SPA's apps/web-buyer/src/lib/formRules.ts —
// keeping them in sync ensures the same field rules and the same error
// copy fire on both portals.
//
// The dealer-side AddBuyerEnquiry / AddSellerEnquiry modals use plain
// useState (not react-hook-form) so this module exposes a per-field
// validate(value) helper plus a buildFieldErrors(form, schema) helper
// that returns Record<field, errorMessage> for inline rendering.

const NAME_REGEX = /^[A-Za-z][A-Za-z .'-]*$/;
// QA: accept an optional single space between "+91" and the 10 digits
// so the displayed format "+91 70156646715" passes client-side validation.
// The space is stripped before the value goes to the API (see normalisePhone /
// toApiPhone helpers below).
const PHONE_REGEX = /^\+91\s?[0-9]{10}$/;

/** Format raw input into the display form "+91 XXXXXXXXXX". */
export function normalisePhone(raw: string): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  const without91 = digits.startsWith('91') ? digits.slice(2) : digits;
  const ten = without91.slice(0, 10);
  return ten ? `+91 ${ten}` : '+91 ';
}

/** Strip the cosmetic space before sending to the API (server expects
 *  the canonical "+91XXXXXXXXXX" wire form). */
export function toApiPhone(displayPhone: string): string {
  return String(displayPhone ?? '').replace(/\s+/g, '');
}
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const PINCODE_REGEX = /^[1-9][0-9]{5}$/;
const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;
const CITY_STATE_REGEX = /^[A-Za-z][A-Za-z .'-]*$/;

/** Returns null when valid, an error message otherwise. */
export type FieldValidator = (value: unknown) => string | null;

const trim = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export const validators = {
  name: ((v: unknown): string | null => {
    if (typeof v !== 'string' || !v.trim()) return 'Full name is required';
    if (v !== v.trim()) return 'Remove leading/trailing spaces';
    if (v.trim().length < 2) return 'Name must be at least 2 characters';
    if (v.trim().length > 100) return 'Name must be 100 characters or fewer';
    if (!NAME_REGEX.test(v.trim()))
      return "Use letters, spaces, hyphens, or apostrophes only (no numbers or special characters)";
    return null;
  }) as FieldValidator,

  phone: ((v: unknown): string | null => {
    if (typeof v !== 'string' || !v.trim()) return 'Mobile number is required';
    if (!PHONE_REGEX.test(v))
      return 'Enter a valid Indian mobile: +91 followed by 10 digits';
    return null;
  }) as FieldValidator,

  email: ((v: unknown): string | null => {
    if (typeof v !== 'string' || !v.trim()) return 'Email is required';
    if (v !== v.trim()) return 'Remove leading/trailing spaces';
    if (!EMAIL_REGEX.test(v.trim())) return 'Enter a valid email address';
    if (v.trim().length > 254) return 'Email must be 254 characters or fewer';
    return null;
  }) as FieldValidator,

  city: ((v: unknown): string | null => {
    if (typeof v !== 'string' || !v.trim()) return 'City is required';
    if (v !== v.trim()) return 'Remove leading/trailing spaces';
    if (v.trim().length < 2) return 'City must be at least 2 characters';
    if (v.trim().length > 60) return 'City must be 60 characters or fewer';
    if (!CITY_STATE_REGEX.test(v.trim()))
      return 'Use letters and spaces only (no numbers or special characters)';
    return null;
  }) as FieldValidator,

  optionalCity: ((v: unknown): string | null => {
    if (!trim(v)) return null;
    return validators.city(v);
  }) as FieldValidator,

  // BUG-032: state validator mirrors city — letters + spaces only.
  state: ((v: unknown): string | null => {
    if (typeof v !== 'string' || !v.trim()) return 'State is required';
    if (v !== v.trim()) return 'Remove leading/trailing spaces';
    if (v.trim().length < 2) return 'State must be at least 2 characters';
    if (v.trim().length > 60) return 'State must be 60 characters or fewer';
    if (!CITY_STATE_REGEX.test(v.trim()))
      return 'Use letters and spaces only (no numbers or special characters)';
    return null;
  }) as FieldValidator,

  optionalState: ((v: unknown): string | null => {
    if (!trim(v)) return null;
    return validators.state(v);
  }) as FieldValidator,

  pincode: ((v: unknown): string | null => {
    if (typeof v !== 'string' || !v.trim()) return 'Pincode is required';
    if (!PINCODE_REGEX.test(v))
      return 'Enter a valid 6-digit Indian pincode (starts with 1-9)';
    return null;
  }) as FieldValidator,

  optionalPincode: ((v: unknown): string | null => {
    if (!trim(v)) return null;
    return validators.pincode(v);
  }) as FieldValidator,

  vin: ((v: unknown): string | null => {
    if (typeof v !== 'string' || !v.trim()) return 'VIN is required';
    if (!VIN_REGEX.test(v))
      return 'VIN must be 17 characters: A-Z (no I, O, Q) or 0-9';
    return null;
  }) as FieldValidator,

  requiredSelect:
    (label: string): FieldValidator =>
    (v: unknown): string | null => {
      if (typeof v !== 'string' || !v.trim()) return `Please select ${label}`;
      return null;
    },

  message: ((v: unknown): string | null => {
    if (typeof v !== 'string' || !v) return null; // optional
    if (v !== v.trim()) return 'Remove leading/trailing spaces';
    if (v.trim().length > 1000)
      return 'Message must be 1000 characters or fewer';
    return null;
  }) as FieldValidator,

  /** Numeric integer in the inclusive range [min, max]. */
  intInRange:
    (min: number, max: number, label: string): FieldValidator =>
    (v: unknown): string | null => {
      if (v === '' || v === null || v === undefined) return null; // optional
      const s = String(v).trim();
      if (!/^[0-9]+$/.test(s)) return `${label} must be a whole number`;
      const n = Number(s);
      if (!Number.isFinite(n) || n < min || n > max)
        return `${label} must be between ${min.toLocaleString('en-IN')} and ${max.toLocaleString('en-IN')}`;
      return null;
    },

  /** Numeric value (integer or decimal) in the inclusive range [min, max]. */
  numberInRange:
    (min: number, max: number, label: string): FieldValidator =>
    (v: unknown): string | null => {
      if (v === '' || v === null || v === undefined) return null; // optional
      const s = String(v).trim();
      // One or more digits, optional single decimal point with one or more digits after.
      if (!/^[0-9]+(\.[0-9]+)?$/.test(s)) return `${label} must be a number`;
      const n = Number(s);
      if (!Number.isFinite(n) || n < min || n > max)
        return `${label} must be between ${min.toLocaleString('en-IN')} and ${max.toLocaleString('en-IN')}`;
      return null;
    },

  requiredIntInRange:
    (min: number, max: number, label: string): FieldValidator =>
    (v: unknown): string | null => {
      if (v === '' || v === null || v === undefined) return `${label} is required`;
      return validators.intInRange(min, max, label)(v);
    },
};

// ─── Real-time input sanitisers (BUG-032 family) ─────────────────────
// Use as onChange handlers to VISUALLY reject invalid characters as
// the user types — pairs with the validators above for submit-time
// validation that catches paste / autofill.

/** Letters, spaces, hyphens, apostrophes, periods only. */
export const sanitizeAlpha = (v: string): string =>
  v.replace(/[^A-Za-z\s\-'.]/g, '');

/** Digits only, truncated to `maxLen` chars. */
export const sanitizeDigits = (v: string, maxLen: number): string =>
  v.replace(/\D/g, '').slice(0, maxLen);

/** Run a schema (Record<field, validator>) over a form object and return
 *  Record<field, errorMessage> for fields that failed. Empty record =
 *  whole form is valid. */
export function buildFieldErrors<T extends Record<string, unknown>>(
  form: T,
  schema: Partial<Record<keyof T, FieldValidator>>,
): Partial<Record<keyof T, string>> {
  const errors: Partial<Record<keyof T, string>> = {};
  for (const key of Object.keys(schema) as Array<keyof T>) {
    const validate = schema[key];
    if (!validate) continue;
    const msg = validate(form[key]);
    if (msg) errors[key] = msg;
  }
  return errors;
}
