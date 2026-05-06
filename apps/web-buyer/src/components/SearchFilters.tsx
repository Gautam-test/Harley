import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { Button, Input, Select } from '@hd-cpo/ui';
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

const formDefaults = (params: URLSearchParams): FormValues => ({
  searchBy: (params.get('searchBy') as 'cash' | 'monthly') || 'cash',
  pincode: params.get('pincode') ?? '',
  distance: params.get('distance') ?? '',
  model: params.get('model') ?? '',
  minYear: params.get('minYear') ?? '',
  colour: params.get('colour') ?? '',
  cert: (params.get('cert') as FormValues['cert']) ?? '',
  maxPrice: params.get('maxPrice') ?? '4900000',
  maxMonthly: params.get('maxMonthly') ?? '49995',
  maxKms: params.get('maxKms') ?? '5000',
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

  useEffect(() => {
    reset(formDefaults(params));
  }, [params, reset]);

  const [searchBy, setSearchBy] = useState<'cash' | 'monthly'>(
    (params.get('searchBy') as 'cash' | 'monthly') || 'cash',
  );
  const maxPrice = watch('maxPrice');
  const maxMonthly = watch('maxMonthly');
  const maxKms = watch('maxKms');

  const onSubmit = (v: FormValues) => {
    const next = new URLSearchParams();
    if (v.searchBy === 'monthly') next.set('searchBy', 'monthly');
    // Only forward pincode/distance to the API when both are supplied — the
    // server-side dealer-radius filter requires the pair (pincode without
    // distance has no meaning, and vice versa).
    if (v.pincode && /^\d{6}$/.test(v.pincode)) next.set('pincode', v.pincode);
    if (v.pincode && v.distance) next.set('distance', v.distance);
    if (v.model) next.set('model', v.model);
    if (v.minYear) next.set('minYear', v.minYear);
    if (v.colour) next.set('colour', v.colour);
    if (v.cert) next.set('cert', v.cert);
    if (searchBy === 'cash' && v.maxPrice) {
      next.set('maxPrice', v.maxPrice);
    } else if (searchBy === 'monthly' && v.maxMonthly) {
      // The API has no monthly-budget filter, so derive an equivalent maxPrice
      // using the same finance assumptions the EmiCalculator defaults to:
      //   20% down, 48 months, 9.5% APR.
      // monthly = principal * r * (1+r)^n / ((1+r)^n - 1), principal = price*0.8
      // → price = monthly * ((1+r)^n - 1) / (r * (1+r)^n) / 0.8
      const monthly = Number(v.maxMonthly);
      const r = 0.095 / 12;
      const n = 48;
      const factor = Math.pow(1 + r, n);
      const principal = (monthly * (factor - 1)) / (r * factor);
      const equivalentPrice = Math.round(principal / 0.8);
      next.set('maxPrice', String(equivalentPrice));
      next.set('maxMonthly', v.maxMonthly); // keep so reload restores the slider
    }
    if (v.maxKms) next.set('maxKms', v.maxKms);
    setParams(next);
  };

  const onReset = () => {
    setSearchBy('cash');
    setParams(new URLSearchParams());
  };

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
                ? 'bg-hd-orange text-hd-white border border-hd-orange'
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
            label="Max Monthly Payment"
            value={maxPrice}
            min={500000}
            max={5000000}
            step={50000}
            register={register('maxPrice')}
            displayValue={`₹${Number(maxPrice).toLocaleString('en-IN')}.00`}
          />
        ) : (
          <SliderField
            label="Max Monthly Payment"
            value={maxMonthly}
            min={5000}
            max={100000}
            step={500}
            register={register('maxMonthly')}
            displayValue={`₹${Number(maxMonthly).toLocaleString('en-IN')}.00`}
          />
        )}

        <SliderField
          label="Km Driven"
          value={maxKms}
          min={89}
          max={5000}
          step={50}
          register={register('maxKms')}
          showRange
          rangeLabels={[`89 KM`, `5000 KM`]}
        />

        <div className="grid grid-cols-1 gap-2 pt-2">
          <Button type="submit">Apply Filters</Button>
          <Button type="button" variant="secondary" onClick={onReset}>
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
