import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Button, Input, Select } from '@hd-cpo/ui';
import { HD_FAMILIES } from '../lib/models';
import { EMI_DEFAULTS } from '../lib/emi';

// Mirrors the Figma "Home" hero — single-line headline, mixed-case
// "Ride With Confidence" tagline, an orange decorative band with the
// H-D bar-and-shield mark on the left, and a search row with a
// "Search by cash Price / Search by Monthly Budget" toggle above it.
//
// Tabs:
//   cash    → posts maxPrice (₹) directly to /listings
//   monthly → derives an equivalent maxPrice from a monthly EMI budget
//             using the shared EMI_DEFAULTS so the buyer sees consistent
//             figures here, on filters, and on the calculator.
//
// PinCode + distance go to the dealer-radius filter on /api/v1/listings;
// the API resolves the pincode to lat/lng via a static prefix map.
type FormValues = {
  pinCode: string;
  distance: string;
  family: string;
  maxPrice: string; // store the slider value (₹) as string so URL params stay simple
  maxMonthly: string; // store the EMI-cap slider value (₹/month) as string
};

const HERO_IMG = '/heros/home.jpg';

const DISTANCE_OPTIONS = [
  { value: '10', label: 'Within 10 km' },
  { value: '25', label: 'Within 25 km' },
  { value: '50', label: 'Within 50 km' },
  { value: '100', label: 'Within 100 km' },
  { value: '500', label: 'Within 500 km' },
];

// Slider bounds — chosen to span the realistic Indian H-D price range
// without crowding the high end (Road Glide CVO maxes ~₹50 L). Step is
// ₹50,000 so the slider feels precise without being twitchy.
const PRICE_MIN = 100_000;
const PRICE_MAX = 5_000_000;
const PRICE_STEP = 50_000;
// Monthly-budget bounds — at the EMI default (10.5% / 60m / 20% down) a
// ₹50,000/mo EMI maps to roughly ₹28L on-road, which covers the same
// catalogue. ₹5,000/mo is the realistic floor for a financed bike.
const MONTHLY_MIN = 5_000;
const MONTHLY_MAX = 80_000;
const MONTHLY_STEP = 1_000;

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export function HeroSearch() {
  const navigate = useNavigate();
  const [searchBy, setSearchBy] = useState<'cash' | 'monthly'>('cash');
  const { register, handleSubmit, watch, setValue } = useForm<FormValues>({
    defaultValues: {
      pinCode: '',
      distance: '',
      family: '',
      maxPrice: String(PRICE_MAX),
      maxMonthly: String(MONTHLY_MAX),
    },
  });
  const maxPrice = watch('maxPrice');
  const maxMonthly = watch('maxMonthly');

  const onSubmit = (v: FormValues) => {
    const params = new URLSearchParams();
    if (v.family) params.set('modelFamily', v.family);

    if (searchBy === 'cash' && Number(v.maxPrice) < PRICE_MAX) {
      params.set('maxPrice', v.maxPrice);
    } else if (searchBy === 'monthly' && Number(v.maxMonthly) < MONTHLY_MAX) {
      // Derive equivalent maxPrice from monthly EMI cap. Same math as
      // SearchFilters so the home → search journey shows consistent
      // numbers (was a bug earlier — different rates between hero and
      // filter sidebar).
      const monthly = Number(v.maxMonthly);
      const r = EMI_DEFAULTS.rateAnnual / 12;
      const n = EMI_DEFAULTS.months;
      const factor = Math.pow(1 + r, n);
      const principal = (monthly * (factor - 1)) / (r * factor);
      const equivalentPrice = Math.round(principal / (1 - EMI_DEFAULTS.downPct));
      params.set('maxPrice', String(equivalentPrice));
      params.set('maxMonthly', v.maxMonthly);
    }

    // Pincode + distance both feed the dealer-radius filter on /listings.
    // The API requires BOTH; a buyer who supplies a pincode but leaves
    // distance on "Any" gets a sensible 50 km catchment by default
    // (matches the H-D dealer outreach radius). This fixes the "search
    // by distance does nothing" report — previously distance was only
    // forwarded when the user explicitly set it, so picking distance
    // alone (or leaving it on default after typing pincode) silently
    // dropped the geo filter.
    if (v.pinCode && /^\d{6}$/.test(v.pinCode)) {
      params.set('pincode', v.pinCode);
      params.set('distance', v.distance || '50');
    }
    navigate(`/search?${params.toString()}`);
  };

  return (
    <>
      <section className="relative bg-hd-black overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url("${HERO_IMG}")` }}
          aria-hidden
        />
        {/* Two-axis gradient: heavy darkness left (text legibility) + a
            soft bottom fade so the search band below visually blends in. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.05) 100%)',
          }}
          aria-hidden
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(0,0,0,0) 60%, rgba(0,0,0,0.55) 100%)',
          }}
          aria-hidden
        />

        {/* Decorative orange side band — sized down (was 80×192 px,
            overlapping the headline on tablet widths; now 56×128 px and
            sits flush in the top-left corner). Hidden below md so the
            phone hero stays uncluttered. */}
        <div
          aria-hidden
          className="hidden md:block absolute top-0 left-0 z-[1]"
        >
          <div className="relative w-14 bg-hd-orange overflow-hidden h-32">
            {/* Diagonal cut at the bottom so the band reads as a banner,
                matching the freeze design. */}
            <div
              className="absolute -bottom-4 inset-x-0 h-8 bg-hd-black"
              style={{ clipPath: 'polygon(0 100%, 100% 100%, 100% 50%, 0 0)' }}
            />
            <div className="absolute inset-0 flex items-start justify-center pt-5">
              <BarAndShield />
            </div>
          </div>
        </div>

        {/*
          md+ adds 80px left padding so the headline never sits under the
          decorative band on tablet widths (where max-w-container can
          extend below the viewport edge). lg keeps the standard rhythm
          since the centred container already clears the band.
        */}
        <div className="relative max-w-container mx-auto px-6 md:pl-24 lg:pl-6 py-24 md:py-32 lg:py-40">
          <div className="max-w-3xl">
            {/* Single-line headline + ™ — replaces the previous stacked
                "H-D CERTIFIED / APPROVED USED BIKES". Figma uses one
                continuous heading for tighter rhythm. */}
            <h1 className="font-headline tracking-headline text-hd-white leading-[0.95] uppercase text-3xl sm:text-4xl md:text-5xl lg:text-6xl">
              H-D Certified
              <span className="text-hd-orange align-super text-base ml-1">&trade;</span>
              {' '}Approved Used Bikes
            </h1>
            {/* Mixed-case tagline in white — was uppercase orange previously.
                Figma deliberately drops the brand orange here so the headline
                ™ stays the only orange highlight in the hero copy block. */}
            <p className="text-base md:text-lg text-hd-white/90 mt-5 font-subhead">
              Ride With Confidence
            </p>
          </div>
        </div>
      </section>

      {/* Search band — sits below the hero photo. */}
      <section className="bg-hd-black border-y border-surface-2">
        <div className="max-w-container mx-auto px-6 py-5">
          {/* Cash / Monthly tab toggle — Figma puts these directly above
              the input row as text-with-chevron toggles. The active label
              is orange; the inactive one is muted white. */}
          <div className="flex items-center gap-6 mb-4">
            <button
              type="button"
              onClick={() => setSearchBy('cash')}
              className={`inline-flex items-center gap-1 font-subhead text-sm transition ${
                searchBy === 'cash'
                  ? 'text-hd-orange'
                  : 'text-text-secondary hover:text-hd-white'
              }`}
            >
              Search by Cash Price
              <Chevron open={searchBy === 'cash'} />
            </button>
            <button
              type="button"
              onClick={() => setSearchBy('monthly')}
              className={`inline-flex items-center gap-1 font-subhead text-sm transition ${
                searchBy === 'monthly'
                  ? 'text-hd-orange'
                  : 'text-text-secondary hover:text-hd-white'
              }`}
            >
              Search by Monthly Budget
              <Chevron open={searchBy === 'monthly'} />
            </button>
          </div>

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="grid grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-3 items-end"
          >
            <FieldLabel label="Pin Code">
              <Input
                placeholder="Enter your pincode"
                inputMode="numeric"
                maxLength={6}
                {...register('pinCode')}
              />
            </FieldLabel>
            <FieldLabel label="Distance">
              <Select {...register('distance')}>
                <option value="">Any distance</option>
                {DISTANCE_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </FieldLabel>
            <FieldLabel label="Family">
              <Select {...register('family')}>
                <option value="">Category (All)</option>
                {HD_FAMILIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            </FieldLabel>

            {/* Slider — switches between cash price (₹) and monthly EMI
                budget (₹/mo) based on the toggle above. The current value
                pops above the slider track in orange so it's legible
                against the dark band. */}
            {searchBy === 'cash' ? (
              <SliderField
                label="Max Price"
                valueLabel={inr(Number(maxPrice))}
                min={PRICE_MIN}
                max={PRICE_MAX}
                step={PRICE_STEP}
                value={Number(maxPrice)}
                onChange={(n) => setValue('maxPrice', String(n), { shouldDirty: true })}
              />
            ) : (
              <SliderField
                label="Max Monthly EMI"
                valueLabel={`${inr(Number(maxMonthly))}/mo`}
                min={MONTHLY_MIN}
                max={MONTHLY_MAX}
                step={MONTHLY_STEP}
                value={Number(maxMonthly)}
                onChange={(n) => setValue('maxMonthly', String(n), { shouldDirty: true })}
              />
            )}

            <div className="self-end col-span-2 lg:col-span-1">
              <Button type="submit" className="w-full">
                Search Stock
              </Button>
            </div>
          </form>
        </div>
      </section>
    </>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block font-subhead uppercase tracking-subhead text-[10px] text-text-secondary mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

// Slider with the current value displayed above the track. Figma shows
// "Max Price" on the left and the live value (₹49,995.00) on the right
// of the same line — using the same column layout here.
function SliderField({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between mb-1.5">
        <span className="font-subhead uppercase tracking-subhead text-[10px] text-text-secondary">
          {label}
        </span>
        <span className="font-subhead text-sm text-hd-orange">{valueLabel}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        // Bare native slider with brand-orange accent. Tailwind v3 ships
        // accent-color support so a single utility colours both the thumb
        // and the filled portion of the track.
        className="w-full h-2 accent-hd-orange cursor-pointer"
      />
    </label>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// Inline H-D bar-and-shield placeholder mark. Stylised, not the official
// trademarked logo — the licensed PNG drops in via a public/brand asset
// later if H-D India approves it for the marketplace. White on the
// orange decorative band.
function BarAndShield() {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-12 h-12"
      aria-hidden
    >
      <path
        d="M8 24 L32 8 L56 24 L56 40 L32 56 L8 40 Z"
        stroke="#FFFFFF"
        strokeWidth="3"
        fill="none"
      />
      <rect x="16" y="28" width="32" height="8" fill="#FFFFFF" />
      <rect x="22" y="22" width="20" height="6" fill="#0F0F0F" />
      <rect x="22" y="36" width="20" height="6" fill="#0F0F0F" />
    </svg>
  );
}
