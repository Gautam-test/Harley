// EMI defaults shared by the calculator on the listing detail page, the
// "EMI from" hint shown next to listing prices, and the SearchFilters
// max-monthly-payment slider. The three places previously hard-coded
// different assumptions (9.5% / 48m vs 10.5% / 60m vs ad-hoc), so a buyer
// who filtered "EMI ≤ ₹30 000" then opened a listing saw a different
// figure on the calculator and assumed the filter was broken.
//
// Single source of truth — change here and every surface updates together.
export const EMI_DEFAULTS = {
  /** Down payment as a fraction of price (0.2 = 20% down). */
  downPct: 0.2,
  /** Loan tenure in months (60 = 5 years). PRD §6.1.5 demo default. */
  months: 60,
  /** Indicative APR — rate as a decimal (0.105 = 10.5% per year). */
  rateAnnual: 0.105,
} as const;

/** Standard EMI formula. Returns rupees per month rounded to a whole number. */
export function approxEmi(
  price: number,
  downPct = EMI_DEFAULTS.downPct,
  months = EMI_DEFAULTS.months,
  rateAnnual = EMI_DEFAULTS.rateAnnual,
): number {
  const principal = price * (1 - downPct);
  if (principal <= 0 || months <= 0) return 0;
  const monthlyRate = rateAnnual / 12;
  if (monthlyRate === 0) return Math.round(principal / months);
  const factor = Math.pow(1 + monthlyRate, months);
  return Math.round((principal * monthlyRate * factor) / (factor - 1));
}
