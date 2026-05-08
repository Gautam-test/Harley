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
//   - KMs:    ~80 km (showroom-floor demos) to ~80,000 km (older inventory).
// Defaults sit at the slider MAX, so "no filter applied" is the resting state;
// the form skips forwarding the param when value === max (see onSubmit).
const PRICE_MAX = 5_000_000;
const PRICE_MIN = 500_000;
const KMS_MAX = 80_000;
const KMS_MIN = 89;
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
    // Pincode triggers the dealer-radius filter. The API requires BOTH pincode
    // and distance; when the user enters a pincode but leaves distance on
    // "Any", we apply a sensible 50 km catchment (matches the default H-D
    // dealer outreach radius). Distance alone (no pincode) does nothing.
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
      className="bg-surface-light border border-gray-200 rounded-card overflow-hidden"
    >
      <div className="px-5 pt-5">
        <p className="font-subhead uppercase tracking-subhead text-xs text-text-on-light">Search By:</p>
        <div className="mt-3 grid grid-cols-2 gap-0">
          <button
            type="button"
            onClick={() => {
              setSearchBy('cash');
              setValue('searchBy', 'cash');
            }}
            className={`px-3 py-2 font-subhead uppercase tracking-subhead text-[11px] rounded-l-card transition ${
              searchBy === 'cash'
                ? 'bg-hd-white text-text-on-light border border-gray-300'
                : 'bg-gray-100 text-gray-500 border border-transparent'
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
            className={`px-3 py-2 font-subhead uppercase tracking-subhead text-[11px] rounded-r-card transition ${
              searchBy === 'monthly'
                ? 'bg-hd-orange text-hd-black border border-hd-orange'
                : 'bg-gray-100 text-gray-500 border border-transparent'
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

        <fieldset>
          <legend className="block text-xs font-subhead uppercase tracking-subhead text-gray-600 mb-2">
            Certification
          </legend>
          <div className="space-y-2 text-sm">
            <Radio name="cert" value="" register={register} label="ALL" />
            <Radio name="cert" value="CPO" register={register} label="H-D Certified™ (CPO)" />
            <Radio name="cert" value="AS_IS" register={register} label="As-Is Listings" />
          </div>
        </fieldset>

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
                : `₹${Number(maxPrice).toLocaleString('en-IN')}`
            }
          />
        ) : (
          <SliderField
            label="Max Monthly Payment"
            value={maxMonthly}
            min={MONTHLY_MIN}
            max={MONTHLY_MAX}
            step={500}
            register={register('maxMonthly')}
            displayValue={
              Number(maxMonthly) >= MONTHLY_MAX
                ? 'Any'
                : `₹${Number(maxMonthly).toLocaleString('en-IN')}/mo`
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
              : `Up to ${Number(maxKms).toLocaleString('en-IN')} km`
          }
          showRange
          rangeLabels={[`${KMS_MIN} KM`, `${KMS_MAX.toLocaleString('en-IN')} KM`]}
        />

        {/* Filters now auto-apply on change, so the explicit Apply button is
            gone. Clear All remains so the user can wipe everything in one go. */}
        <div className="pt-2">
          <Button type="button" variant="secondary" onClick={onReset} className="w-full">
            Clear All
          </Button>
        </div>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-subhead uppercase tracking-subhead text-gray-600 mb-2">
        {label}
      </label>
      {children}
    </div>
  );
}

function Radio({
  name,
  value,
  label,
  register,
}: {
  name: keyof FormValues;
  value: string;
  label: string;
  register: ReturnType<typeof useForm<FormValues>>['register'];
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="radio"
        value={value}
        className="h-4 w-4 accent-hd-orange"
        {...register(name)}
      />
      <span className="text-sm text-text-on-light">{label}</span>
    </label>
  );
}

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
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-xs font-subhead uppercase tracking-subhead text-gray-600">
          {label}
        </label>
        {displayValue && (
          <span className="text-xs font-subhead text-hd-orange">{displayValue}</span>
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
        className="w-full accent-hd-orange"
      />
      {showRange && rangeLabels && (
        <div className="flex justify-between text-[10px] text-gray-500 mt-1 font-subhead uppercase tracking-subhead">
          <span>{rangeLabels[0]}</span>
          <span>{rangeLabels[1]}</span>
        </div>
      )}
    </div>
  );
}
