// Shared validation rules for the buyer SPA's enquiry / sell-bike forms.
//
// Two design principles:
//   1. Every rule returns a friendly, field-specific error message — no
//      generic "Required" or "Invalid" copy.
//   2. Trim/whitespace checks are explicit (no leading/trailing spaces)
//      so a buyer can't paste a value with stray spaces and have it
//      silently submit. The accompanying length checks all apply to the
//      trimmed value, never the raw input.
//
// All rules plug straight into react-hook-form's `register` and
// `Controller`'s `rules` prop. Examples:
//
//   register('name', nameRules)
//   register('email', emailRules)
//   <Controller name="phone" rules={phoneRules} ... />

const NAME_REGEX = /^[A-Za-z][A-Za-z .'-]*$/;
// QA: accept an optional single space between "+91" and the 10 digits
// so the displayed format "+91 70156646715" passes client-side validation.
// The space is stripped before the value goes to the API (see usages of
// the toApiPhone helper in each modal).
const PHONE_REGEX = /^\+91\s?[0-9]{10}$/;
// Tighter than the trivial /^\S+@\S+\.\S+$/ — rejects spaces in the local
// part, requires a TLD of at least 2 chars, no consecutive dots in the
// domain. Still pragmatic enough to accept every real-world email.
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
// Indian PIN codes always start 1-9 (region 0 doesn't exist in the
// postal system). Reject "000000" and other zero-prefixed inputs.
const PINCODE_REGEX = /^[1-9][0-9]{5}$/;
const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;
const CITY_STATE_REGEX = /^[A-Za-z][A-Za-z .'-]*$/;

/** Wrapper helper: a non-empty trimmed string. Used in `validate` blocks. */
const isNonEmpty = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

export const nameRules = {
  required: 'Full name is required',
  validate: {
    notEmpty: (v: string) =>
      isNonEmpty(v) || 'Full name is required',
    noLeadingTrailingSpace: (v: string) =>
      v === v.trim() || 'Remove leading/trailing spaces',
    minChars: (v: string) =>
      v.trim().length >= 2 || 'Name must be at least 2 characters',
    maxChars: (v: string) =>
      v.trim().length <= 100 || 'Name must be 100 characters or fewer',
    allowedChars: (v: string) =>
      NAME_REGEX.test(v.trim()) ||
      "Use letters, spaces, hyphens, or apostrophes only (no numbers or @, #, etc.)",
  },
} as const;

/** Strip the cosmetic space between "+91" and the 10-digit subscriber
 *  number before sending to the API. The server-side phone schemas
 *  require the canonical "+91XXXXXXXXXX" (no whitespace) wire form. */
export function toApiPhone(displayPhone: string): string {
  return displayPhone.replace(/\s+/g, '');
}

export const phoneRules = {
  required: 'Mobile number is required',
  validate: {
    format: (v: string) =>
      PHONE_REGEX.test(v) ||
      'Enter a valid Indian mobile: +91 followed by 10 digits',
  },
} as const;

export const emailRules = {
  required: 'Email is required',
  validate: {
    noLeadingTrailingSpace: (v: string) =>
      v === v.trim() || 'Remove leading/trailing spaces',
    format: (v: string) =>
      EMAIL_REGEX.test(v.trim()) || 'Enter a valid email address',
    maxChars: (v: string) =>
      v.trim().length <= 254 || 'Email must be 254 characters or fewer',
  },
} as const;

export const cityRules = {
  required: 'City is required',
  validate: {
    notEmpty: (v: string) => isNonEmpty(v) || 'City is required',
    noLeadingTrailingSpace: (v: string) =>
      v === v.trim() || 'Remove leading/trailing spaces',
    minChars: (v: string) =>
      v.trim().length >= 2 || 'City must be at least 2 characters',
    maxChars: (v: string) =>
      v.trim().length <= 60 || 'City must be 60 characters or fewer',
    allowedChars: (v: string) =>
      CITY_STATE_REGEX.test(v.trim()) ||
      'Use letters and spaces only (no numbers or special characters)',
  },
} as const;

/** Optional city — used in places where city isn't required (e.g. the
 *  buyer enquiry's optional city dropdown). When supplied, applies the
 *  same shape rules as cityRules; when blank, validation passes. */
export const optionalCityRules = {
  validate: {
    shape: (v: string | undefined) => {
      if (!v || !v.trim()) return true;
      if (v !== v.trim()) return 'Remove leading/trailing spaces';
      if (v.trim().length < 2) return 'City must be at least 2 characters';
      if (v.trim().length > 60) return 'City must be 60 characters or fewer';
      if (!CITY_STATE_REGEX.test(v.trim()))
        return 'Use letters and spaces only';
      return true;
    },
  },
} as const;

export const pincodeRules = {
  required: 'Pincode is required',
  validate: {
    format: (v: string) =>
      PINCODE_REGEX.test(v) ||
      'Enter a valid 6-digit Indian pincode (starts with 1-9)',
  },
} as const;

/** Optional pincode — same shape but blank passes. */
export const optionalPincodeRules = {
  validate: {
    shape: (v: string | undefined) =>
      !v || PINCODE_REGEX.test(v) ||
      'Enter a valid 6-digit Indian pincode (starts with 1-9)',
  },
} as const;

export const vinRules = {
  required: 'VIN is required',
  validate: {
    format: (v: string) =>
      VIN_REGEX.test(v) ||
      'VIN must be 17 characters: A-Z (no I, O, Q) or 0-9',
  },
} as const;

/** For dropdowns / select fields. Pass the human label so the message
 *  reads "Please select dealer" / "Please select city". */
export const requiredSelect = (label: string) =>
  ({
    required: `Please select ${label}`,
    validate: {
      notEmpty: (v: string) =>
        isNonEmpty(v) || `Please select ${label}`,
    },
  }) as const;

/** Free-text message / description field. Optional but capped. */
export const messageRules = {
  validate: {
    noLeadingTrailingSpace: (v: string) =>
      !v || v === v.trim() || 'Remove leading/trailing spaces',
    maxChars: (v: string) =>
      !v || v.trim().length <= 1000 ||
      'Message must be 1000 characters or fewer',
  },
} as const;

/** Terms-and-conditions checkbox. */
export const termsCheckboxRules = {
  validate: {
    accepted: (v: boolean) =>
      v === true || 'You must accept the terms to continue',
  },
} as const;

/** Strip leading/trailing spaces on blur — used as a Controller's
 *  onBlur transform so the field's stored value is always trimmed. */
export const trimOnBlur = (
  setValue: (v: string) => void,
) => (e: React.FocusEvent<HTMLInputElement>) => {
  const trimmed = e.target.value.trim();
  if (trimmed !== e.target.value) setValue(trimmed);
};
