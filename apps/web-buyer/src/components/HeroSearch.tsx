import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Button, Input, Select } from '@hd-cpo/ui';
import { HD_FAMILIES, modelsForFamily } from '../lib/models';

// Mirrors the frozen Figma "Home" hero exactly:
// 1. Photograph with overlaid headline + "Ride With Confidence" tagline (left)
// 2. Dark band BELOW the hero with a 5-field search row:
//    Pin Code · Distance · Models · Year · Max Price · [Search Stock]
//
// The Distance + PinCode fields are kept in the UI to match the freeze; they
// don't filter yet (no dealer-radius search in the API). Year and Max Price
// hit `minYear` and `maxPrice` on /listings.
type FormValues = {
  pinCode: string;
  distance: string;
  model: string;
  minYear: string;
  maxPrice: string;
};

// Hero photograph — H-D rider on a sunset highway, served locally so the home
// page banner doesn't depend on an external CDN. Lifestyle shot that holds up
// under the dark gradient overlay.
const HERO_IMG = '/heros/home.jpg';

const DISTANCE_OPTIONS = [
  { value: '10', label: 'Within 10 km' },
  { value: '25', label: 'Within 25 km' },
  { value: '50', label: 'Within 50 km' },
  { value: '100', label: 'Within 100 km' },
  { value: '500', label: 'Within 500 km' },
];

const ALL_MODELS = HD_FAMILIES.flatMap((f) => modelsForFamily(f));

const YEAR_OPTIONS = (() => {
  const now = new Date().getFullYear();
  const out: { value: string; label: string }[] = [];
  for (let y = now; y >= now - 8; y--) out.push({ value: String(y), label: `${y} or newer` });
  return out;
})();

const BUDGET_OPTIONS = [
  { value: '1000000', label: 'Under ₹10 L' },
  { value: '1500000', label: 'Under ₹15 L' },
  { value: '2000000', label: 'Under ₹20 L' },
  { value: '2500000', label: 'Under ₹25 L' },
  { value: '3500000', label: 'Under ₹35 L' },
];

export function HeroSearch() {
  const navigate = useNavigate();
  const { register, handleSubmit } = useForm<FormValues>({
    defaultValues: { pinCode: '', distance: '', model: '', minYear: '', maxPrice: '' },
  });

  const onSubmit = (v: FormValues) => {
    const params = new URLSearchParams();
    if (v.model) params.set('model', v.model);
    if (v.minYear) params.set('minYear', v.minYear);
    if (v.maxPrice) params.set('maxPrice', v.maxPrice);
    // Pincode + distance go to the dealer-radius filter on /api/v1/listings.
    // Server resolves the pincode to lat/lng using a static prefix map and
    // filters by haversine distance. Both must be present to take effect.
    if (v.pinCode && /^\d{6}$/.test(v.pinCode)) params.set('pincode', v.pinCode);
    if (v.pinCode && v.distance) params.set('distance', v.distance);
    navigate(`/search?${params.toString()}`);
  };

  return (
    <>
      {/* Hero photograph with overlaid headline (left-aligned). */}
      <section className="relative bg-hd-black overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url("${HERO_IMG}")` }}
          aria-hidden
        />
        {/* Two-axis gradient: heavy darkness left (text legibility) + a soft
            bottom fade so the search band below visually blends in. */}
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
        <div className="relative max-w-container mx-auto px-6 py-24 md:py-32 lg:py-40">
          <div className="max-w-2xl">
            <h1 className="font-headline text-4xl md:text-6xl lg:text-7xl tracking-headline text-hd-white leading-[0.95] uppercase">
              H-D <span className="text-hd-orange">Certified</span>
              <span className="text-hd-orange align-super text-base">&trade;</span>
              <br />
              Approved Used Bikes
            </h1>
            <p className="font-subhead uppercase tracking-subhead text-base md:text-lg text-hd-orange mt-5">
              Ride With Confidence
            </p>
          </div>
        </div>
      </section>

      {/* Search band — sits below the hero photo. */}
      <section className="bg-hd-black border-y border-surface-2">
        <div className="max-w-container mx-auto px-6 py-5">
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="grid grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] gap-3"
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
                <option value="">Any Distance</option>
                {DISTANCE_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </FieldLabel>
            <FieldLabel label="Models">
              <Select {...register('model')}>
                <option value="">Model (All)</option>
                {ALL_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </FieldLabel>
            <FieldLabel label="Year">
              <Select {...register('minYear')}>
                <option value="">Year (All)</option>
                {YEAR_OPTIONS.map((y) => (
                  <option key={y.value} value={y.value}>
                    {y.label}
                  </option>
                ))}
              </Select>
            </FieldLabel>
            <FieldLabel label="Max Price">
              <Select {...register('maxPrice')}>
                <option value="">Category (All)</option>
                {BUDGET_OPTIONS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </Select>
            </FieldLabel>
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
