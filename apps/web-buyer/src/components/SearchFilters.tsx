import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { Button, Input, Select } from '@hd-cpo/ui';
import { EMI_DEFAULTS } from '../lib/emi';
import { HD_FAMILIES, modelsForFamily } from '../lib/models';
import { api } from '../lib/api';

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
// Client feedback #10: these are now defaults only — the component fetches
// live min/max from /api/v1/listings/filter-ranges on mount and updates
// slider bounds dynamically based on actual dealer inventory.
const PRICE_MAX_DEFAULT = 5_000_000;
const PRICE_MIN_DEFAULT = 500_000;
const KMS_MAX_DEFAULT = 500_000;
const KMS_MIN_DEFAULT = 89;
const MONTHLY_MAX = 100_000;
const MONTHLY_MIN = 5_000;

interface FilterRanges {
  minPrice: number;
  maxPrice: number;
  minKms: number;
  maxKms: number;
}

const formDefaults = (params: URLSearchParams, ranges?: FilterRanges): FormValues => {
  const priceMax = ranges?.maxPrice ?? PRICE_MAX_DEFAULT;
  const kmsMax   = ranges?.maxKms   ?? KMS_MAX_DEFAULT;
  return {
    searchBy: (params.get('searchBy') as 'cash' | 'monthly') || 'cash',
    pincode: params.get('pincode') ?? '',
    distance: params.get('distance') ?? '',
    model: params.get('model') ?? '',
    minYear: params.get('minYear') ?? '',
    colour: params.get('colour') ?? '',
    cert: (params.get('cert') as FormValues['cert']) ?? '',
    maxPrice: params.get('maxPrice') ?? String(priceMax),
    maxMonthly: params.get('maxMonthly') ?? String(MONTHLY_MAX),
    maxKms: params.get('maxKms') ?? String(kmsMax),
  };
};

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
  // Client feedback #10: dynamic filter ranges from live inventory
  const [ranges, setRanges] = useState<FilterRanges>({
    minPrice: PRICE_MIN_DEFAULT,
    maxPrice: PRICE_MAX_DEFAULT,
    minKms:   KMS_MIN_DEFAULT,
    maxKms:   KMS_MAX_DEFAULT,
  });
  useEffect(() => {
    api<FilterRanges>('/listings/filter-ranges')
      .then((r) => {
        setRanges(r);
        // If user hasn't set a custom filter, reset sliders to dynamic max
        if (!params.get('maxPrice')) setValue('maxPrice', String(r.maxPrice));
        if (!params.get('maxKms'))   setValue('maxKms',   String(r.maxKms));
      })
      .catch(() => { /* keep defaults on error */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { register, handleSubmit, reset, control, setValue, watch } = useForm<FormValues>({
    defaultValues: formDefaults(params),
  });

  const watchedModel = useWatch({ control, name: 'model' });
  // QA latest: watch the pincode so the Distance dropdown enables only
  // once a valid 6-digit pincode is present (mirrors the hero banner).
  const watchedPincode = useWatch({ control, name: 'pincode' });
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
    //
    // QA: a buyer who supplies a pincode but leaves distance on "Any"
    // expected the result grid to refresh to bikes near that pincode.
    // The earlier "pincode-only → exact-match-first" logic fell through
    // to the unbounded result set when no dealer was at the exact
    // pincode, which made the filter look broken (listings looked
    // identical to no-filter). Default to a 50 km catchment when
    // pincode is supplied without an explicit distance — matches the
    // hero search widget, gives the API a haversine radius to actually
    // filter against, and "Any Distance" only takes effect when the
    // buyer cleared the pincode too.
    if (v.pincode && /^\d{6}$/.test(v.pincode)) {
      next.set('pincode', v.pincode);
      next.set('distance', v.distance || '50');
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
    if (searchBy === 'cash' && v.maxPrice && Number(v.maxPrice) < ranges.maxPrice) {
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
    if (v.maxKms && Number(v.maxKms) < ranges.maxKms) next.set('maxKms', v.maxKms);
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
  // value, so we don't fire a request after each keystroke. QA: 250ms (was
  // 400ms) so the result grid feels immediate the moment the 6th digit is
  // typed — matches the slider/select debounce above.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!allValues.pincode || /^\d{6}$/.test(allValues.pincode)) {
      debounceRef.current = setTimeout(() => {
        handleSubmit(onSubmit)();
      }, 250);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allValues.pincode]);

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="border border-gray-200 overflow-hidden"
      style={{ backgroundColor: '#F6F6F6' }}
    >
      <div className="px-5 pt-5">
        {/* QA BUG-008: persistent top-of-sidebar Reset link so the buyer
            doesn't have to scroll past 8+ filter blocks to find the Clear
            Filters button at the bottom. Only renders when at least one
            filter is actually set, so it doesn't add visual noise on the
            default unfiltered view. */}
        {Array.from(params.keys()).length > 0 && (
          <div className="flex justify-end mb-2 -mt-1">
            <button
              type="button"
              onClick={onReset}
              className="font-subhead uppercase tracking-subhead text-[10px] text-hd-orange hover:underline"
            >
              Reset Filters
            </button>
          </div>
        )}
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

      {/* QA latest: inner panel inherits the #F6F6F6 wrapper fill so
          the whole "Search By" sidebar above the EMI Calculator reads
          as one continuous light-grey block per Figma. Was previously
          split (grey top + white inputs panel) which broke the visual
          rhythm. */}
      <div className="p-5 space-y-5 mt-4 border-t border-gray-200">
        <Field label="Pincode">
          <Input placeholder="Enter your pincode" inputMode="numeric" maxLength={6} {...register('pincode')} />
        </Field>

        {/* QA latest: Distance is disabled by default and stays grey
            until a valid 6-digit pincode is entered, then it enables
            with a #FFFFFF background — mirroring the hero banner
            behaviour (distance is only meaningful relative to a
            pincode).
            Fix: also check the URL param directly so the dropdown is
            enabled immediately when navigating from the hero (pincode
            arrives in the URL before the RHF watch fires). */}
        <Field label="Distance">
          <Select
            disabled={!/^\d{6}$/.test(watchedPincode ?? '') && !/^\d{6}$/.test(params.get('pincode') ?? '')}
            style={
              /^\d{6}$/.test(watchedPincode ?? '') || /^\d{6}$/.test(params.get('pincode') ?? '')
                ? { backgroundColor: '#FFFFFF' }
                : { backgroundColor: '#C0C0C0', borderColor: '#C0C0C0' }
            }
            className="disabled:cursor-not-allowed"
            {...register('distance')}
          >
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
        {/* QA latest: when the slider sits at its max, show the EXPLICIT
            cap (e.g. "₹ 50,00,000") instead of the vague "Any" fallback
            — per Figma the buyer needs to see the boundary value so the
            filter range is legible at a glance. */}
        {searchBy === 'cash' ? (
          <SliderField
            label="Price"
            value={maxPrice}
            min={ranges.minPrice}
            max={ranges.maxPrice}
            step={50000}
            register={register('maxPrice')}
            displayValue={`₹${Number(maxPrice).toLocaleString('en-IN', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`}
            showRange
            rangeLabels={[
              `₹${ranges.minPrice.toLocaleString('en-IN')}`,
              `₹${ranges.maxPrice.toLocaleString('en-IN')}`,
            ]}
          />
        ) : (
          <SliderField
            label="Monthly Budget"
            value={maxMonthly}
            min={MONTHLY_MIN}
            max={MONTHLY_MAX}
            step={500}
            register={register('maxMonthly')}
            displayValue={`₹${Number(maxMonthly).toLocaleString('en-IN', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}/mo`}
          />
        )}

        <SliderField
          label="Km Driven"
          value={maxKms}
          min={ranges.minKms}
          max={ranges.maxKms}
          step={1000}
          register={register('maxKms')}
          displayValue={`${Number(maxKms).toLocaleString('en-IN')} KM`}
          showRange
          rangeLabels={[`${ranges.minKms} KM`, `${ranges.maxKms.toLocaleString('en-IN')} KM`]}
        />

        {/* QA: "Apply Filters" CTA removed — every filter (price, year,
            engine, KMs, model, fuel, transmission, owner, distance,
            pincode) already auto-applies via the debounced effect above,
            so the button was a no-op that confused buyers into thinking
            nothing happened until they clicked it. Clear Filters stays —
            it's an intentional reset, not a re-trigger. */}
        <div className="pt-2">
          <Button type="button" variant="secondary" onClick={onReset} className="w-full">
            Clear Filters
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
  // QA latest: Interest Rate is now an interactive slider, not a
  // hardcoded static read-out. Range 5%-15% (realistic Indian auto-loan
  // band), 0.1% step. Seeded from EMI_DEFAULTS so the initial figure
  // matches what other surfaces (hero, sidebar Monthly Budget) compute.
  const [rateAnnualPct, setRateAnnualPct] = useState<number>(EMI_DEFAULTS.rateAnnual * 100);

  const principal = price * (1 - downPct);
  const r = rateAnnualPct / 100 / 12;
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
          {/* QA latest: On-Road Price value is the headline figure in
              the calc — pulled up to a bold 14px subhead so it visually
              dominates the slider row (it's the input the buyer most
              often eyeballs while dragging the slider). */}
          <span className="font-subhead font-bold text-[14px] text-text-on-light">
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

      {/* Client feedback #11: rate range 10.5%–20%. Default already
          seeded from EMI_DEFAULTS.rateAnnual = 10.5%. */}
      <div className="mt-3">
        <div className="flex items-baseline justify-between">
          <label htmlFor="emi-rate" className="font-body text-[12px] text-gray-500">
            Interest Rate
          </label>
          <span className="font-body text-[13px] text-text-on-light">
            {rateAnnualPct.toFixed(1)}% APR
          </span>
        </div>
        <input
          id="emi-rate"
          type="range"
          min={10.5}
          max={20}
          step={0.1}
          value={rateAnnualPct}
          onChange={(e) => setRateAnnualPct(Number(e.target.value))}
          className="hero-range w-full cursor-pointer mt-2"
          style={{ background: trackGradient(pct(rateAnnualPct, 10.5, 20)) }}
        />
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
  const rawPct = max > min ? ((numericValue - min) / (max - min)) * 100 : 0;
  const pct = Math.min(100, Math.max(0, rawPct));
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
