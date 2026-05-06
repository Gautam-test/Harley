import { useState } from 'react';
import { Button } from '@hd-cpo/ui';

// PRD §6.1.5 — purely client-side amortisation. No data saved.
function emi(principal: number, ratePctYearly: number, months: number): number {
  if (months === 0 || principal === 0) return 0;
  const r = ratePctYearly / 12 / 100;
  if (r === 0) return principal / months;
  const f = Math.pow(1 + r, months);
  return (principal * r * f) / (f - 1);
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const DOWN_PRESETS = [10, 20, 30, 50];
const TENURE_PRESETS = [24, 36, 48, 60, 72, 84];

export function EmiCalculator({ price, bikeLabel }: { price: number; bikeLabel?: string }) {
  const [downPct, setDownPct] = useState(20);
  const [tenure, setTenure] = useState(60);
  const [rate, setRate] = useState(10.5);

  const downPayment = (price * downPct) / 100;
  const loan = price - downPayment;
  const monthly = emi(loan, rate, tenure);
  const total = monthly * tenure;
  const interest = total - loan;
  const totalWithDown = total + downPayment;

  // Visual split bar — principal vs interest (the loan portion only).
  const interestPct = total > 0 ? (interest / total) * 100 : 0;
  const principalPct = 100 - interestPct;

  const years = Math.floor(tenure / 12);
  const months = tenure % 12;
  const tenureLabel =
    years > 0 && months > 0
      ? `${years}y ${months}m`
      : years > 0
      ? `${years} year${years > 1 ? 's' : ''}`
      : `${tenure} months`;

  return (
    <div className="bg-hd-white border border-gray-200 shadow-sm rounded-card overflow-hidden">
      {/* Header */}
      <header className="px-5 py-4 border-b border-gray-200 flex items-baseline justify-between">
        <h3 className="font-subhead uppercase tracking-subhead text-text-on-light text-sm">
          Finance Estimate
        </h3>
        <span className="text-[10px] font-subhead uppercase tracking-subhead text-gray-400">
          Indicative
        </span>
      </header>

      {/* Big EMI display + breakdown bar */}
      <section className="px-5 pt-5 pb-4 bg-surface-light/40">
        <p className="text-[10px] font-subhead uppercase tracking-subhead text-gray-500">
          Monthly EMI
        </p>
        <p className="font-headline text-4xl text-hd-orange mt-1 leading-none">
          {inr(monthly)}
        </p>
        <p className="text-xs text-gray-600 mt-1">
          for <strong className="text-text-on-light">{tenureLabel}</strong> at{' '}
          <strong className="text-text-on-light">{rate}%</strong> p.a.
        </p>

        {/* Principal vs interest split bar */}
        <div className="mt-4">
          <div
            className="flex h-2 overflow-hidden rounded-full bg-gray-200"
            role="img"
            aria-label={`Principal ${Math.round(principalPct)}%, interest ${Math.round(interestPct)}%`}
          >
            <div
              className="bg-hd-orange transition-all"
              style={{ width: `${principalPct}%` }}
            />
            <div
              className="bg-hd-black transition-all"
              style={{ width: `${interestPct}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-[10px] font-subhead uppercase tracking-subhead">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-hd-orange rounded-sm" />
              <span className="text-gray-600">Principal</span>
              <span className="text-text-on-light">{inr(loan)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-gray-600">Interest</span>
              <span className="text-text-on-light">{inr(interest)}</span>
              <span className="w-2 h-2 bg-hd-black rounded-sm" />
            </span>
          </div>
        </div>
      </section>

      {/* Controls */}
      <div className="px-5 py-5 space-y-5 border-t border-gray-200">
        <Slider
          label="Down payment"
          metric={`${downPct}% · ${inr(downPayment)}`}
          min={0}
          max={90}
          step={5}
          value={downPct}
          onChange={setDownPct}
        >
          <Chips
            values={DOWN_PRESETS}
            current={downPct}
            onPick={setDownPct}
            format={(v) => `${v}%`}
          />
        </Slider>

        <Slider
          label="Tenure"
          metric={tenureLabel}
          min={12}
          max={84}
          step={6}
          value={tenure}
          onChange={setTenure}
        >
          <Chips
            values={TENURE_PRESETS}
            current={tenure}
            onPick={setTenure}
            format={(v) => `${v}m`}
          />
        </Slider>

        <Slider
          label="Interest rate"
          metric={`${rate}% p.a.`}
          min={5}
          max={20}
          step={0.1}
          value={rate}
          onChange={setRate}
        />
      </div>

      {/* Totals */}
      <dl className="px-5 py-4 bg-surface-light/40 border-t border-gray-200 grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-gray-600">Loan amount</dt>
        <dd className="text-right text-text-on-light">{inr(loan)}</dd>

        <dt className="text-gray-600">Total interest</dt>
        <dd className="text-right text-text-on-light">{inr(interest)}</dd>

        <dt className="font-subhead uppercase tracking-subhead text-text-on-light text-xs pt-2 border-t border-gray-200">
          Total payable
        </dt>
        <dd className="text-right pt-2 border-t border-gray-200 font-subhead text-text-on-light">
          {inr(totalWithDown)}
        </dd>
      </dl>

      {/* Footer */}
      <footer className="px-5 py-4 border-t border-gray-200">
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Indicative only. Actual rates and approval determined by lender. EMI
          calculator does not constitute a loan offer.
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="w-full mt-3"
          onClick={() => {
            const subject = `H-D Certified — EMI estimate${bikeLabel ? ` for ${bikeLabel}` : ''}`;
            const lines = [
              bikeLabel ? `Bike: ${bikeLabel}` : null,
              `On-road price: ${inr(price)}`,
              `Down payment (${downPct}%): ${inr(downPayment)}`,
              `Loan amount: ${inr(loan)}`,
              `Tenure: ${tenureLabel}`,
              `Interest rate: ${rate}% p.a.`,
              ``,
              `Monthly EMI: ${inr(monthly)}`,
              `Total interest: ${inr(interest)}`,
              `Total payable (including down payment): ${inr(totalWithDown)}`,
              ``,
              `Indicative only. Actual rates and approval determined by lender.`,
              `Generated from H-D Certified — Approved Used Bikes.`,
            ].filter(Boolean);
            const body = lines.join('\n');
            window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
          }}
        >
          Email This Estimate
        </Button>
      </footer>
    </div>
  );
}

interface SliderProps {
  label: string;
  metric: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (n: number) => void;
  children?: React.ReactNode;
}

function Slider({ label, metric, min, max, step, value, onChange, children }: SliderProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <label className="text-[10px] font-subhead uppercase tracking-subhead text-gray-600">
          {label}
        </label>
        <span className="text-xs font-subhead text-text-on-light">{metric}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-hd-orange cursor-pointer"
        aria-label={label}
      />
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

interface ChipsProps {
  values: number[];
  current: number;
  onPick: (n: number) => void;
  format: (v: number) => string;
}

function Chips({ values, current, onPick, format }: ChipsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => {
        const active = current === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onPick(v)}
            className={`px-2.5 py-1 text-[10px] font-subhead uppercase tracking-subhead border transition ${
              active
                ? 'bg-hd-black text-hd-white border-hd-black'
                : 'bg-hd-white text-gray-700 border-gray-300 hover:border-hd-orange hover:text-hd-orange'
            }`}
          >
            {format(v)}
          </button>
        );
      })}
    </div>
  );
}
