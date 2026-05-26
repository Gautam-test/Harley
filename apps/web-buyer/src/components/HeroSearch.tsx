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

// Year filter removed from the hero search per BUG_UI_002 #4 — Figma is
// a 3-input grid + slider + Search button. The Year filter still lives
// on /search sidebar for power-users.

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

// BUG_UI_002 #5: Figma formats the slider amount with two decimal
// places ("₹49,995.00"). Native en-IN locale renders without decimals,
// so we explicitly request 2 fraction digits to match the design.
const inr = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
      <section
        className="relative bg-hd-black overflow-hidden"
        style={{ height: '480px' }}
      >
        {/* QA latest: brand accent flag — provided Flag.svg vector
            (asymmetric vertical flag with H-D corporate emblem inset
            into the top white panel). Native aspect 85×627 ≈ 0.135 :1
            so the flag drops vertically from the top of the hero on
            its own. Height fills the 650px hero on desktop; scales
            down on smaller breakpoints. Hidden on the smallest
            phones (<sm) to keep the headline + search legible. */}
        <div className="absolute top-0 left-0 z-10 hidden sm:block pointer-events-none">
          <img
            src="/brand/hd-flag.svg"
            alt="H-D Bar & Shield flag"
            className="h-[360px] sm:h-[400px] md:h-[440px] lg:h-[480px] w-auto"
            width={85}
            height={627}
            decoding="async"
          />
        </div>
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

        {/* QA latest: hero is now a fixed 650px shell. Content sits
            vertically centred via h-full + flex so the headline +
            subhead read as the focal block regardless of viewport
            below the 650px lock. */}
        <div className="relative max-w-container mx-auto px-6 h-full flex items-center">
          <div className="max-w-4xl">
            {/* QA BUG_UI_044: headline locked to 34px on desktop per
                Figma (was 32px). Wide 1903 Sans Bold. Single-line at
                lg+ via whitespace-nowrap. */}
            <h1 className="font-subhead font-bold tracking-subhead text-hd-white leading-[1.05] uppercase text-[22px] sm:text-2xl md:text-[28px] lg:text-[34px] lg:whitespace-nowrap">
              H-D Certified
              <span className="text-hd-orange align-super text-[0.55em] ml-1">&trade;</span>
              {' '}Approved Used Motorcycles
            </h1>
            {/* QA latest: subhead 22px per Figma, font-weight 500
                (Medium), Title Case. */}
            <p className="font-subhead font-medium text-hd-white mt-5 text-[16px] sm:text-lg md:text-[20px] lg:text-[22px]">
              Ride With Confidence
            </p>
          </div>
        </div>
      </section>

      {/* Search band — sits below the hero photo. Figma /Customer/Home.png
          uses a charcoal grey (not pure black) so the white input fields
          contrast clearly against the band without the inputs disappearing. */}
      {/* QA latest: search band sub-container — premium glassmorphism
          treatment per Figma. Translucent dark fill (rgba(0,0,0,0.6))
          + heavy backdrop blur so the photo bleeds through subtly.
          Falls back to plain dark fill in browsers without
          backdrop-filter support. */}
      <section
        className="hero-search-band border-y border-surface-1"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
        }}
      >
        <div className="max-w-container mx-auto px-6 py-5">
          {/* Cash / Monthly tab toggle — font-weight 500 (Medium) per
              Figma; active = orange, inactive = white/70. */}
          <div className="flex items-center gap-6 mb-4">
            <button
              type="button"
              onClick={() => setSearchBy('cash')}
              className={`inline-flex items-center gap-1 font-subhead font-medium text-sm transition ${
                searchBy === 'cash'
                  ? 'text-hd-orange'
                  : 'text-hd-white/70 hover:text-hd-white'
              }`}
            >
              Search by cash Price
              <Chevron open={searchBy === 'cash'} />
            </button>
            <button
              type="button"
              onClick={() => setSearchBy('monthly')}
              className={`inline-flex items-center gap-1 font-subhead font-medium text-sm transition ${
                searchBy === 'monthly'
                  ? 'text-hd-orange'
                  : 'text-hd-white/70 hover:text-hd-white'
              }`}
            >
              Search by Monthly Budget
              <Chevron open={searchBy === 'monthly'} />
            </button>
          </div>

          {/* BUG_UI_002 #4: Figma is a 3-input grid (Pin Code · Distance ·
              Family) + Max Price slider + Search button. The extra Year
              dropdown that lived here broke the 3-column rhythm and is
              removed. (Year filter still lives on /search sidebar for
              power-users.) */}
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="grid grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.4fr_auto] gap-3 items-end"
          >
            <FieldLabel label="Pin Code">
              <Input
                placeholder="Enter your pincode"
                inputMode="numeric"
                maxLength={6}
                {...register('pinCode')}
              />
            </FieldLabel>
            {/* BUG_UI_002 #4 (per attached Figma screenshot): Distance
                has a SOLID light-grey fill (not the white the other two
                inputs use) so it reads as the "secondary / pre-filled"
                filter sitting between Pin Code and Family. bg-gray-300
                matches the Figma swatch closely. */}
            <FieldLabel label="Distance">
              {/* QA latest: Distance dropdown background = exact
                  Figma swatch #C0C0C0 (silver-grey). */}
              <Select
                style={{ backgroundColor: '#C0C0C0', borderColor: '#C0C0C0' }}
                className="text-gray-700"
                {...register('distance')}
              >
                <option value="">Any distance</option>
                {DISTANCE_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </FieldLabel>
            {/* BUG_UI_002 #4: Figma label is "Family" (not "Models"). */}
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

// BUG_UI_002 attached-screenshot revision: Figma labels are sentence-case
// (Pin Code / Distance / Family / Max Price), NOT uppercase. They sit in
// the body face at ~13px / light weight, with the inputs immediately
// below. The previous tracking-subhead + uppercase treatment shouted at
// the buyer and didn't match the calm reference.
function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block font-body text-[13px] text-hd-white mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

// Slider with the current value displayed on the same row as the label,
// right-aligned. Figma shows e.g. "Max Price ... ₹49,995.00" — the value
// is in white (not orange) and bold-ish so it reads as a numeric badge,
// not as a secondary caption.
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
        <span className="font-body text-[13px] text-hd-white">
          {label}
        </span>
        <span className="font-body font-bold text-sm text-hd-white">{valueLabel}</span>
      </span>
      {/* Slider track painted as a gradient that fills orange up to the
          current value and goes white (translucent) after. The native
          accent-color path doesn't let the filled portion sit visually
          flush with a custom thumb glyph, so we hand-paint the track via
          a linear-gradient computed from value/(max-min). The custom
          .hero-range class (defined in packages/ui/src/styles.css) styles
          the WebKit + Moz thumbs as a 22×22 white disc with an inline
          SVG showing the < > glyph Figma uses. */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="hero-range w-full cursor-pointer"
        style={{
          background: `linear-gradient(to right, #FF6600 0%, #FF6600 ${
            ((value - min) / (max - min)) * 100
          }%, rgba(255,255,255,0.25) ${
            ((value - min) / (max - min)) * 100
          }%, rgba(255,255,255,0.25) 100%)`,
        }}
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

