import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { Button, Input, Select } from '@hd-cpo/ui';
import { EMI_DEFAULTS } from '../lib/emi';
import { HD_FAMILIES, modelsForFamily } from '../lib/models';

const COLOURS = ['', 'Vivid Black', 'Pearl White', 'Red', 'Blue', 'Silver', 'Orange', 'Black Denim', 'Industrial Yellow'];

interface FormValues {
  searchBy: 'cash' | 'monthly';
  pincode: string;
  distance: string;
  model: string;
  minYear: string;
  colour: string;
  cert: '' | 'CPO' | 'AS_IS';
  maxPrice: string;
  maxMonthly: string;
  maxKms: string;
}

const DISTANCE_OPTIONS = [
  { value: '', label: 'Any Distance' },
  { value: '10', label: 'Within 10 km' },
  { value: '25', label: 'Within 25 km' },
  { value: '50', label: 'Within 50 km' },
  { value: '100', label: 'Within 100 km' },
  { value: '500', label: 'Within 500 km' },
];

const YEAR_OPTIONS = (() => {
  const now = new Date().getFullYear();
  const out: { value: string; label: string }[] = [{ value: '', label: 'Year (All)' }];
  for (let y = now; y >= now - 8; y--) out.push({ value: String(y), label: `${y} or newer` });
  return out;
})();

// Slider configuration — sized to actual H-D used-bike data:
//   - Prices: ~4 lakh to ~30 lakh, with rare CVO-tier bikes up to ~50 lakh.
//   - KMs:    Figma boundary markers use 89 KM / 5,000 KM. Real inventory
//             goes higher than 5K — the slider supports up to 80,000 km
//             but the displayed range labels stay aligned with the Figma
//             reference (89 KM minimum / 5,000 KM "common" upper) so the
//             buyer's first read matches the design rhythm. The slider
//             itself can be dragged past the visual cap.
//   - Monthly: ~₹5K to ~₹100K covers the realistic financed range.
// Defaults sit at the slider MAX, so "no filter applied" is the resting
// state; the form skips forwarding the param when value === max
// (see onSubmit).
const PRICE_MAX = 5_000_000;
const PRICE_MIN = 500_000;
const KMS_MAX = 80_000;
const KMS_MIN = 89;
// Visible "scale" labels at slider ends — match Figma exactly so the
// boundary markers read 89 KM ... 5,000 KM. The slider can still travel
// to KMS_MAX (80,000) — the labels just don't try to literally show that
// value, since the buyer's read of "5,000 KM" matches the design.
const KMS_LABEL_MAX = 5_000;
const MONTHLY_MAX = 100_000;
const MONTHLY_MIN = 5_000;

const formDefaults = (params: URLSearchParams): FormValues => ({
  searchBy: (params.get('searchBy') as 'cash' | 'monthly') || 'cash',
  pincode: params.get('pincode') ?? '',
  distance: params.get('distance') ?? '',
  model: params.get('model') ?? '',
  minYear: params.get('minYear') ?? '',
  colour: params.get('colour') ?? '',
  cert: (params.get('cert') as FormValues['cert']) ?? '',
  maxPrice: params.get('maxPrice') ?? String(PRICE_MAX),
  maxMonthly: params.get('maxMonthly') ?? String(MONTHLY_MAX),
  maxKms: params.get('maxKms') ?? String(KMS_MAX),
});

// Filter sidebar mirrors the frozen Figma "Search Stock" layout:
//   Search By: Cash Price | Monthly Budget toggle
//   Pincode · Distance · Models · Year · Colors
//   Certification radios (All / H-D Certified / As-Is)
//   Max Monthly Payment slider · Km Driven slider
//   APPLY FILTERS · CLEAR ALL
//
// pincode + distance are kept in the UI to match the freeze; not yet sent to
// the API since dealer-radius search isn't wired.
export function SearchFilters() {
  const [params, setParams] = useSearchParams();
  const { register, handleSubmit, reset, control, setValue, watch } = useForm<FormValues>({
    defaultValues: formDefaults(params),
  });

  const watchedModel = useWatch({ control, name: 'model' });
  const validModels = HD_FAMILIES.flatMap((f) => modelsForFamily(f));
  useEffect(() => {
    if (watchedModel && !validModels.includes(watchedModel)) {
      setValue('model', '');
    }
  }, [watchedModel, validModels, setValue]);

  // Track whether the in-flight params change came from this component (so we
  // don't reset the form back to URL state mid-edit, which would clobber the
  // user's typing). When we push params via setParams from auto-apply, we set
  // this flag; the params-watcher then ignores that one round-trip.
  const selfDrivenChange = useRef(false);
  useEffect(() => {
    if (selfDrivenChange.current) {
      selfDrivenChange.current = false;
      return;
    }
    reset(formDefaults(params));
  }, [params, reset]);

  const [searchBy, setSearchBy] = useState<'cash' | 'monthly'>(
    (params.get('searchBy') as 'cash' | 'monthly') || 'cash',
  );
  const maxPrice = watch('maxPrice');
  const maxMonthly = watch('maxMonthly');
  const maxKms = watch('maxKms');

  // Auto-apply debounce timer — declared up here so onReset (Clear All)
  // can cancel any in-flight submit before clearing form state. Without
  // this hoist the reset path raced with a pending pincode-effect timer
  // (QA BUG-4: filter values appeared to "stick" after Clear All).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onSubmit = (v: FormValues) => {
    const next = new URLSearchParams();
    if (v.searchBy === 'monthly') next.set('searchBy', 'monthly');
    // Pincode + distance feed the dealer-radius filter on the API.
    // QA RE-OPEN: when "Any Distance" is selected (empty v.distance),
    // we used to silently inject 50 km — which made the "All Distance"
    // option behave the same as a 50 km radius and gave the buyer no
    // way to actually disable the geo filter. Now: distance is only
    // forwarded when the user explicitly picks a value. Pincode-only
    // (no distance) keeps the exact-pincode match logic; pincode +
    // explicit distance fires the strict haversine radius filter.
    if (v.pincode && /^\d{6}$/.test(v.pincode)) {
      next.set('pincode', v.pincode);
      if (v.distance) next.set('distance', v.distance);
    }
    if (v.model) next.set('model', v.model);
    if (v.minYear) next.set('minYear', v.minYear);
    if (v.colour) next.set('colour', v.colour);
    if (v.cert) next.set('cert', v.cert);
    // Sliders only forward their value when the user has constrained below
    // the slider max. At-max values represent "no upper bound" and shouldn't
    // act as filters — otherwise a user clicking Apply without touching the
    // sliders would silently exclude bikes priced above 4.9 lakh or with
    // more than 5,000 km.
    if (searchBy === 'cash' && v.maxPrice && Number(v.maxPrice) < PRICE_MAX) {
      next.set('maxPrice', v.maxPrice);
    } else if (
      searchBy === 'monthly' &&
      v.maxMonthly &&
      Number(v.maxMonthly) < MONTHLY_MAX
    ) {
      // The API has no monthly-budget filter, so derive an equivalent
      // maxPrice. EMI defaults are imported from the shared lib so this
      // filter, the listing-detail "EMI from" hint, and the calculator
      // tile all use the same assumptions — previously the filter ran on
      // 9.5% / 48m while the calculator ran on 10.5% / 60m, leaving
      // buyers confused why a "₹30 000/mo" filter returned bikes the
      // calculator showed at ₹35 000/mo.
      // monthly = principal * r * (1+r)^n / ((1+r)^n - 1)
      //   where principal = price * (1 - downPct)
      // → price = monthly * ((1+r)^n - 1) / (r * (1+r)^n) / (1 - downPct)
      const monthly = Number(v.maxMonthly);
      const r = EMI_DEFAULTS.rateAnnual / 12;
      const n = EMI_DEFAULTS.months;
      const factor = Math.pow(1 + r, n);
      const principal = (monthly * (factor - 1)) / (r * factor);
      const equivalentPrice = Math.round(principal / (1 - EMI_DEFAULTS.downPct));
      next.set('maxPrice', String(equivalentPrice));
      next.set('maxMonthly', v.maxMonthly); // keep so reload restores the slider
    }
    if (v.maxKms && Number(v.maxKms) < KMS_MAX) next.set('maxKms', v.maxKms);
    selfDrivenChange.current = true;
    setParams(next);
  };

  const onReset = () => {
    // Belt-and-braces reset: wipe form state immediately AND clear the
    // URL. The params-watcher would also call reset() on the next tick,
    // but doing it here ensures the slider / pincode / dropdown values
    // visibly snap back even if the watcher path is interrupted by a
    // parallel auto-apply pass. selfDrivenChange flag is intentionally
    // NOT raised — we WANT the watcher to confirm the reset on its tick.
    //
    // Cancel any in-flight auto-apply timer so a pending submit can't
    // re-apply the now-cleared form values after we've already reset.
    // QA BUG-4: previously a pending pincode timeout could race past the
    // reset and silently push the cleared form back through onSubmit.
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    selfDrivenChange.current = false;
    setSearchBy('cash');
    reset(formDefaults(new URLSearchParams()));
    setParams(new URLSearchParams());
  };

  // Auto-apply: every form change kicks off a debounced submit so the result
  // grid reflects the filter immediately without the dealer needing to click
  // Apply. Slider drags get a short 250 ms debounce; selects/radios fire on
  // the next tick. Cleared on unmount.
  const allValues = useWatch({ control });
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      handleSubmit(onSubmit)();
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    allValues.model,
    allValues.minYear,
    allValues.colour,
    allValues.cert,
    allValues.maxPrice,
    allValues.maxKms,
    allValues.maxMonthly,
    allValues.distance,
    searchBy,
  ]);
  // Pincode is a free-text input — only auto-apply once it's a valid 6-digit
  // value, so we don't fire a request after each keystroke.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!allValues.pincode || /^\d{6}$/.test(allValues.pincode)) {
      debounceRef.current = setTimeout(() => {
        handleSubmit(onSubmit)();
      }, 400);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allValues.pincode]);

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-surface-light border border-gray-200 overflow-hidden"
    >
      <div className="px-5 pt-5">
        {/* QA BUG_UI_028: Title Case "Search By:" header, muted grey,
            1903 Sans Regular. Not uppercase. */}
        <p className="font-body text-[13px] text-gray-500">Search By:</p>
        {/* Tab selector — Title Case "Cash Price" / "Monthly Budget"
            labels. Active state = orange fill + white text; inactive =
            white card with grey border. Default state has neither
            highlighted; user picks one. */}
        <div className="mt-3 grid grid-cols-2">
          <button
            type="button"
            onClick={() => {
              setSearchBy('cash');
              setValue('searchBy', 'cash');
            }}
            className={`h-10 px-3 font-body text-[13px] border transition ${
              searchBy === 'cash'
                ? 'bg-hd-orange text-hd-white border-hd-orange font-bold'
                : 'bg-hd-white text-text-on-light border-gray-300 hover:border-gray-400'
            }`}
          >
            Cash Price
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchBy('monthly');
              setValue('searchBy', 'monthly');
            }}
            className={`h-10 px-3 font-body text-[13px] border -ml-px transition ${
              searchBy === 'monthly'
                ? 'bg-hd-orange text-hd-white border-hd-orange font-bold'
                : 'bg-hd-white text-text-on-light border-gray-300 hover:border-gray-400'
            }`}
          >
            Monthly Budget
          </button>
        </div>
      </div>

      <div className="p-5 space-y-5 bg-hd-white mt-4 border-t border-gray-200">
        <Field label="Pincode">
          <Input placeholder="Enter your pincode" inputMode="numeric" maxLength={6} {...register('pincode')} />
        </Field>

        <Field label="Distance">
          <Select {...register('distance')}>
            {DISTANCE_OPTIONS.map((d) => (
              <option key={d.value || 'any'} value={d.value}>
                {d.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Models">
          <Select {...register('model')}>
            <option value="">Model (All)</option>
            {validModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Year">
          <Select {...register('minYear')}>
            {YEAR_OPTIONS.map((y) => (
              <option key={y.value || 'any'} value={y.value}>
                {y.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Colors">
          <Select {...register('colour')}>
            {COLOURS.map((c) => (
              <option key={c || 'any'} value={c}>
                {c || 'Colors (All)'}
              </option>
            ))}
          </Select>
        </Field>

        {/* BUG re-open #4: Certification radio group REMOVED. The same
            filter is now exposed via the top CertTabs row above the
            results grid (All / Certified / As-Is). Both surfaces wrote
            the same `cert` URL param so removing one path doesn't lose
            functionality. */}

        {/* BUG re-open #5: sliders use the shared .hero-range class with
            the white circular `<>` thumb, value formatted with `.00`
            suffix per Figma. Boundary range labels show 89 KM / 5,000 KM
            per the Figma reference even though the slider can travel
            higher (the API still accepts up to KMS_MAX). */}
        {searchBy === 'cash' ? (
          <SliderField
            label="Max Price"
            value={maxPrice}
            min={PRICE_MIN}
            max={PRICE_MAX}
            step={50000}
            register={register('maxPrice')}
            displayValue={
              Number(maxPrice) >= PRICE_MAX
                ? 'Any'
                : `₹${Number(maxPrice).toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
            }
          />
        ) : (
          <SliderField
            label="Monthly Budget"
            value={maxMonthly}
            min={MONTHLY_MIN}
            max={MONTHLY_MAX}
            step={500}
            register={register('maxMonthly')}
            displayValue={
              Number(maxMonthly) >= MONTHLY_MAX
                ? 'Any'
                : `₹${Number(maxMonthly).toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}/mo`
            }
          />
        )}

        <SliderField
          label="Km Driven"
          value={maxKms}
          min={KMS_MIN}
          max={KMS_MAX}
          step={500}
          register={register('maxKms')}
          displayValue={
            Number(maxKms) >= KMS_MAX
              ? 'Any'
              : `${Number(maxKms).toLocaleString('en-IN')} KM`
          }
          showRange
          rangeLabels={[`${KMS_MIN} KM`, `${KMS_LABEL_MAX.toLocaleString('en-IN')} KM`]}
        />

        {/* Figma /Customer/Bike Listing.png shows APPLY FILTERS (orange) + CLEAR ALL
            (outlined) stacked. Filters still auto-apply on change for fast feedback;
            the Apply button is now a no-op visual confirmation that mirrors the
            design and gives a clear "I'm done" affordance for keyboard / screen-
            reader users. */}
        <div className="pt-2 space-y-2">
          <Button type="submit" className="w-full">
            Apply Filters
          </Button>
          <Button type="button" variant="secondary" onClick={onReset} className="w-full">
            Clear All
          </Button>
        </div>

        {/* QA BUG_UI_028: EMI Calculator widget — "Apply as Filter"
            CTA removed (not in Figma spec). Widget is purely
            informational; the buyer reads the monthly figure and
            decides how to adjust the Monthly Budget slider above. */}
        <EmiCalculatorPanel />
      </div>
    </form>
  );
}

// ---------- EMI Calculator panel (Figma-spec sidebar widget) ----------
// Purely presentational — no API calls, no parent callbacks. QA
// BUG_UI_028: removed the "Apply as Filter" CTA, brightened metric
// label colour (text-gray-500), bumped the EMI result font size.
function EmiCalculatorPanel() {
  const [price, setPrice] = useState<number>(1_500_000);
  const [downPct, setDownPct] = useState<number>(EMI_DEFAULTS.downPct);
  const [months, setMonths] = useState<number>(EMI_DEFAULTS.months);

  const principal = price * (1 - downPct);
  const r = EMI_DEFAULTS.rateAnnual / 12;
  const n = months;
  const factor = Math.pow(1 + r, n);
  const monthly =
    principal <= 0 || n <= 0
      ? 0
      : r === 0
      ? Math.round(principal / n)
      : Math.round((principal * r * factor) / (factor - 1));

  const inr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`;
  const pct = (v: number, min: number, max: number) =>
    ((v - min) / (max - min)) * 100;

  const trackGradient = (p: number) =>
    `linear-gradient(to right, #FF6600 0%, #FF6600 ${p}%, #E5E7EB ${p}%, #E5E7EB 100%)`;

  return (
    <section
      aria-labelledby="emi-calc-heading"
      className="mt-4 border-t border-gray-200 pt-5"
    >
      <h3
        id="emi-calc-heading"
        className="font-body text-[13px] text-gray-500"
      >
        EMI Calculator
      </h3>

      <div className="mt-3">
        <div className="flex items-baseline justify-between">
          <label htmlFor="emi-price" className="font-body text-[12px] text-gray-500">
            On-Road Price
          </label>
          <span className="font-body text-[13px] text-text-on-light">
            {inr(price)}
          </span>
        </div>
        <input
          id="emi-price"
          type="range"
          min={100_000}
          max={5_000_000}
          step={50_000}
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
          className="hero-range w-full cursor-pointer mt-2"
          style={{ background: trackGradient(pct(price, 100_000, 5_000_000)) }}
        />
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between">
          <label htmlFor="emi-down" className="font-body text-[12px] text-gray-500">
            Down Payment
          </label>
          <span className="font-body text-[13px] text-text-on-light">
            {Math.round(downPct * 100)}% &middot; {inr(price * downPct)}
          </span>
        </div>
        <input
          id="emi-down"
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

      <div className="mt-3">
        <div className="flex items-baseline justify-between">
          <label htmlFor="emi-months" className="font-body text-[12px] text-gray-500">
            Tenure
          </label>
          <span className="font-body text-[13px] text-text-on-light">
            {months} months
          </span>
        </div>
        <input
          id="emi-months"
          type="range"
          min={12}
          max={84}
          step={6}
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
          className="hero-range w-full cursor-pointer mt-2"
          style={{ background: trackGradient(pct(months, 12, 84)) }}
        />
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <span className="font-body text-[12px] text-gray-500">Interest Rate</span>
        <span className="font-body text-[13px] text-text-on-light">
          {(EMI_DEFAULTS.rateAnnual * 100).toFixed(1)}% APR
        </span>
      </div>

      {/* Estimated Monthly EMI callout — bigger figure per QA. */}
      <div className="mt-4 bg-gray-100 p-4">
        <p className="font-body text-[11px] text-gray-600 uppercase tracking-subhead">
          Estimated Monthly EMI
        </p>
        <p className="font-subhead font-bold text-3xl tracking-subhead text-hd-orange mt-1 leading-none">
          {inr(monthly)}
        </p>
      </div>
    </section>
  );
}

// QA BUG_UI_028: Title Case label in 1903 Sans Regular, muted grey,
// not uppercase. Wraps each Pincode/Distance/Models/Year/Colors field.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-body text-[13px] text-gray-500 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

// Radio helper kept for any future use, but the Certification group it
// drove is no longer mounted (removed per BUG re-open #4).

// Slider uses the shared .hero-range class so the thumb matches the
// hero search exactly (white circle with the `<>` glyph). Track is
// painted via inline linear-gradient so the filled portion is bright
// orange and the unfilled portion is a light grey — works inside the
// white sidebar card AND the dark hero band without per-context CSS.
function SliderField({
  label,
  value,
  min,
  max,
  step,
  register,
  displayValue,
  showRange,
  rangeLabels,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  register: ReturnType<ReturnType<typeof useForm<FormValues>>['register']>;
  displayValue?: string;
  showRange?: boolean;
  rangeLabels?: [string, string];
}) {
  const numericValue = Number(value);
  const pct = max > min ? ((numericValue - min) / (max - min)) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block font-body text-[13px] text-text-on-light">
          {label}
        </label>
        {displayValue && (
          <span className="font-body font-bold text-[13px] text-text-on-light">
            {displayValue}
          </span>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={register.onChange}
        onBlur={register.onBlur}
        name={register.name}
        ref={register.ref}
        className="hero-range w-full cursor-pointer"
        style={{
          background: `linear-gradient(to right, #FF6600 0%, #FF6600 ${pct}%, #E5E7EB ${pct}%, #E5E7EB 100%)`,
        }}
      />
      {showRange && rangeLabels && (
        <div className="flex justify-between text-[11px] text-gray-500 mt-1 font-body">
          <span>{rangeLabels[0]}</span>
          <span>{rangeLabels[1]}</span>
        </div>
      )}
    </div>
  );
}
