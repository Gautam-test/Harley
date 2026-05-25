import { useState } from 'react';
import { EMI_DEFAULTS } from '../lib/emi';

// QA Figma overhaul: replaces the previous "Finance Estimate" widget
// (large monthly callout + 10/20/30/50 down-payment chips + 24/36/48/60/72/
// 84 tenure chips + Email-This-Estimate button + principal/interest split
// bar) with the clean "EMI CALCULATOR" the Figma spec calls for —
// On-Road Price / Down Payment / Tenure / Interest Rate sliders + a single
// "Estimated Monthly EMI" callout inside a soft grey box.
//
// `bikeLabel` is kept on the prop signature so the listing-detail caller
// doesn't need to change; it's no longer rendered.
function emiCalc(principal: number, ratePctYearly: number, months: number): number {
  if (months === 0 || principal === 0) return 0;
  const r = ratePctYearly / 12 / 100;
  if (r === 0) return Math.round(principal / months);
  const f = Math.pow(1 + r, months);
  return Math.round((principal * r * f) / (f - 1));
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const trackGradient = (pct: number) =>
  `linear-gradient(to right, #FF6600 0%, #FF6600 ${pct}%, #E5E7EB ${pct}%, #E5E7EB 100%)`;
const pct = (v: number, min: number, max: number) =>
  max > min ? ((v - min) / (max - min)) * 100 : 0;

interface EmiCalculatorProps {
  /** Bike's on-road price — seeds the On-Road Price slider. */
  price: number;
  /** Optional human-readable bike label (kept for API back-compat; unused). */
  bikeLabel?: string;
}

export function EmiCalculator({ price }: EmiCalculatorProps) {
  // Seed price from the listing; let the buyer adjust if they're
  // budgeting against a different number.
  const [onRoadPrice, setOnRoadPrice] = useState<number>(price);
  const [downPct, setDownPct] = useState<number>(EMI_DEFAULTS.downPct);
  const [tenure, setTenure] = useState<number>(EMI_DEFAULTS.months);
  const [rate, setRate] = useState<number>(EMI_DEFAULTS.rateAnnual * 100);

  const downPayment = onRoadPrice * downPct;
  const loan = Math.max(0, onRoadPrice - downPayment);
  const monthly = emiCalc(loan, rate, tenure);

  return (
    <section
      aria-labelledby="emi-calc-pdp-heading"
      className="bg-hd-white border border-gray-200 p-5"
    >
      <div className="flex items-baseline justify-between">
        <h3
          id="emi-calc-pdp-heading"
          className="font-subhead font-bold uppercase tracking-subhead text-text-on-light text-sm"
        >
          EMI Calculator
        </h3>
        <span className="font-body text-[10px] uppercase tracking-subhead text-gray-400">
          Indicative
        </span>
      </div>

      {/* On-Road Price */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <label htmlFor="pdp-emi-price" className="font-body text-[12px] text-text-on-light">
            On-Road Price
          </label>
          <span className="font-body font-bold text-[13px] text-text-on-light">
            {inr(onRoadPrice)}
          </span>
        </div>
        <input
          id="pdp-emi-price"
          type="range"
          min={100_000}
          max={5_000_000}
          step={50_000}
          value={onRoadPrice}
          onChange={(e) => setOnRoadPrice(Number(e.target.value))}
          className="hero-range w-full cursor-pointer mt-2"
          style={{ background: trackGradient(pct(onRoadPrice, 100_000, 5_000_000)) }}
        />
      </div>

      {/* Down Payment */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <label htmlFor="pdp-emi-down" className="font-body text-[12px] text-text-on-light">
            Down Payment
          </label>
          <span className="font-body font-bold text-[13px] text-text-on-light">
            {Math.round(downPct * 100)}% &middot; {inr(downPayment)}
          </span>
        </div>
        <input
          id="pdp-emi-down"
          type="range"
          min={0.05}
          max={0.5}
          step={0.05}
          value={downPct}
          onChange={(e) => setDownPct(Number(e.target.value))}
          className="hero-range w-full cursor-pointer mt-2"
          style={{ background: trackGradient(pct(downPct, 0.05, 0.5)) }}
        />
      </div>

      {/* Tenure */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <label htmlFor="pdp-emi-tenure" className="font-body text-[12px] text-text-on-light">
            Tenure
          </label>
          <span className="font-body font-bold text-[13px] text-text-on-light">
            {tenure} months
          </span>
        </div>
        <input
          id="pdp-emi-tenure"
          type="range"
          min={12}
          max={84}
          step={6}
          value={tenure}
          onChange={(e) => setTenure(Number(e.target.value))}
          className="hero-range w-full cursor-pointer mt-2"
          style={{ background: trackGradient(pct(tenure, 12, 84)) }}
        />
      </div>

      {/* Interest Rate */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <label htmlFor="pdp-emi-rate" className="font-body text-[12px] text-text-on-light">
            Interest Rate
          </label>
          <span className="font-body font-bold text-[13px] text-text-on-light">
            {rate.toFixed(1)}% p.a.
          </span>
        </div>
        <input
          id="pdp-emi-rate"
          type="range"
          min={5}
          max={20}
          step={0.1}
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
          className="hero-range w-full cursor-pointer mt-2"
          style={{ background: trackGradient(pct(rate, 5, 20)) }}
        />
      </div>

      {/* Estimated Monthly EMI callout — soft grey panel + orange figure
          per Figma. */}
      <div className="mt-5 bg-gray-100 p-4">
        <p className="font-body text-[11px] uppercase tracking-subhead text-gray-600">
          Estimated Monthly EMI
        </p>
        <p className="font-subhead font-bold text-3xl tracking-subhead text-hd-orange mt-1 leading-none">
          {inr(monthly)}
        </p>
        <p className="text-[10px] text-gray-500 mt-2 leading-snug">
          Indicative only. Actual rates and approval determined by the lender.
        </p>
      </div>
    </section>
  );
}
