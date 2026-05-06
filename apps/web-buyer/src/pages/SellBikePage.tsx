import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Button, Input, Select } from '@hd-cpo/ui';
import { api, ApiError } from '../lib/api';
import { InfoGateModal } from '../components/InfoGateModal';
import { HERO, PageHero } from '../components/PageHero';
import { HD_MODEL_CATALOG } from '../lib/models';
import { INDIA_STATES, citiesForState } from '../lib/indiaGeo';
import { reverseGeocode } from '../lib/reverseGeocode';

interface FormValues {
  username: string;
  bikeModel: string;
  vin: string;
  phone: string;
  email: string;
  location: string;
  state: string;
  city: string;
  pincode: string;
  dealerId: string;
  acceptedTerms: boolean;
}

interface DealerOption {
  id: string;
  name: string;
  city: string;
}

function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const without91 = digits.startsWith('91') ? digits.slice(2) : digits;
  return `+91${without91.slice(0, 10)}`;
}

// PRD §6.1.6 — /sell-bike trade-in form. Layout per Figma /Customer/Frame
// 28.png — "TELL US ABOUT YOUR BIKE" — 2-column compact form, all fields
// visible at once. Phone is captured here so the OTP modal can skip its own
// collection step and go straight to verification.
export function SellBikePage() {
  const { register, handleSubmit, formState, getValues, setValue, control } =
    useForm<FormValues>({
      defaultValues: {
        username: '',
        bikeModel: '',
        vin: '',
        phone: '+91',
        email: '',
        location: '',
        state: '',
        city: '',
        pincode: '',
        dealerId: '',
        acceptedTerms: false,
      },
      mode: 'onChange',
    });
  const [modalOpen, setModalOpen] = useState(false);
  const [submitted, setSubmitted] = useState<{ id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const dealersQuery = useQuery({
    queryKey: ['public-dealers-options', 'sell-bike'],
    queryFn: () =>
      api<DealerOption[]>('/dealers?lat=20.5937&lng=78.9629&radius=500'),
    staleTime: 5 * 60 * 1000,
  });

  // State → City dependency.
  const selectedState = useWatch({ control, name: 'state' });
  const cityOptions = citiesForState(selectedState ?? '');

  const onSubmit = () => setModalOpen(true);

  const handleVerified = async (data: { phone: string }) => {
    setModalOpen(false);
    setSubmitting(true);
    setError(null);
    try {
      const v = getValues();
      const res = await api<{ id: string }>('/leads/trade-in', {
        method: 'POST',
        withOtpToken: true,
        body: JSON.stringify({
          username: v.username,
          bikeModel: v.bikeModel,
          vin: v.vin,
          phone: data.phone,
          email: v.email,
          city: v.city || 'Unknown',
          dealerId: v.dealerId || undefined,
        }),
      });
      setSubmitted({ id: res.id });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not submit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Sell Your Harley — H-D Certified</title>
        <meta
          name="description"
          content="Trade in your Harley-Davidson with an authorised dealer. Quick, no-obligation valuation."
        />
      </Helmet>
      <PageHero
        title="Sell Your"
        emphasis="Harley"
        subtitle="A simple intake to authorised H-D dealers. No public classifieds, no haggling with strangers."
        image={HERO.sellBike}
        size="lg"
      />
      {/* Match the Figma modal width — narrower than the previous max-w-2xl */}
      <div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
        {submitted ? (
          <div className="mt-10">
            <div className="bg-hd-black text-hd-white rounded-card overflow-hidden">
              <div className="bg-hd-orange px-6 py-3 flex items-center gap-3">
                <span
                  aria-hidden
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-hd-white text-hd-orange font-bold"
                >
                  ✓
                </span>
                <span className="font-subhead uppercase tracking-subhead text-sm text-hd-white">
                  Enquiry Sent
                </span>
              </div>
              <div className="px-6 py-6">
                <h2 className="font-headline tracking-headline uppercase text-2xl md:text-3xl leading-tight">
                  Thank you.{' '}
                  <span className="text-hd-orange">Ride With Confidence.</span>
                </h2>
                <p className="text-text-secondary mt-3">
                  An authorised H-D dealer will reach out within 48 hours.
                </p>

                <div className="mt-6 border-t border-surface-2 pt-4">
                  <p className="font-subhead uppercase tracking-subhead text-[11px] text-text-secondary">
                    Reference ID — save this
                  </p>
                  <code className="block font-mono text-sm text-hd-white break-all mt-2">
                    {submitted.id}
                  </code>
                </div>

                <Link
                  to={`/track?id=${submitted.id}`}
                  className="inline-block mt-5 bg-hd-orange text-hd-white font-subhead uppercase tracking-subhead text-xs px-5 py-2.5 rounded-card hover:brightness-110 transition"
                >
                  Track Your Enquiry →
                </Link>
              </div>
            </div>
          </div>
        ) : (
          /* Frame 28 — "TELL US ABOUT YOUR BIKE" modal layout, replicated
             as a page-level card. Orange top accent + 2-col field grid. */
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="mt-10 bg-hd-white border-t-4 border-hd-orange border border-gray-200 p-6 md:p-8 space-y-4 shadow-sm rounded-card"
          >
            <h2 className="font-subhead uppercase tracking-subhead text-text-on-light text-xl">
              Tell Us About Your Bike
            </h2>

            <Labelled label="Your Name">
              <Input
                placeholder="Mohd Tai"
                {...register('username', { required: true, minLength: 2 })}
              />
            </Labelled>

            <div className="grid grid-cols-2 gap-3">
              <Labelled label="Bike Model">
                <Select {...register('bikeModel', { required: true })}>
                  <option value="">Choose bike model</option>
                  {HD_MODEL_CATALOG.map((g) => (
                    <optgroup key={g.family} label={g.family}>
                      {g.models.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </Labelled>
              <Labelled label="VIN Number">
                <Input
                  maxLength={17}
                  placeholder="Enter bike vin number"
                  className="font-mono uppercase"
                  {...register('vin', {
                    required: true,
                    pattern: /^[A-HJ-NPR-Z0-9]{17}$/,
                  })}
                />
              </Labelled>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Labelled label="Phone Number">
                <Input
                  inputMode="tel"
                  maxLength={13}
                  placeholder="+91XXXXXXXXXX"
                  {...register('phone', {
                    required: true,
                    validate: (v) =>
                      /^\+91[0-9]{10}$/.test(v) ||
                      'Phone must be +91 followed by 10 digits',
                    onChange: (e) =>
                      setValue('phone', normalisePhone(e.target.value), {
                        shouldValidate: true,
                      }),
                  })}
                />
              </Labelled>
              <Labelled label="Location">
                <div className="relative">
                  <Input
                    placeholder={geoBusy ? 'Locating…' : 'Choose location'}
                    readOnly={geoBusy}
                    {...register('location')}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    disabled={geoBusy}
                    onClick={() => {
                      if (!navigator.geolocation) return;
                      setGeoBusy(true);
                      setGeoError(null);
                      navigator.geolocation.getCurrentPosition(
                        async (pos) => {
                          try {
                            const r = await reverseGeocode(
                              pos.coords.latitude,
                              pos.coords.longitude,
                            );
                            setValue(
                              'location',
                              r.locality ||
                                `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
                              { shouldValidate: true },
                            );
                            if (r.state) {
                              setValue('state', r.state, { shouldValidate: true });
                              setValue('city', r.city ?? '', {
                                shouldValidate: true,
                              });
                            }
                            if (r.pincode) {
                              setValue('pincode', r.pincode, { shouldValidate: true });
                            }
                            if (r.countryCode && r.countryCode !== 'IN') {
                              setGeoError('Outside India — please enter address manually.');
                            }
                          } catch (e) {
                            setGeoError(
                              e instanceof Error ? e.message : 'Could not resolve location',
                            );
                          } finally {
                            setGeoBusy(false);
                          }
                        },
                        (err) => {
                          setGeoBusy(false);
                          if (err.code !== 1) setGeoError('Could not get your location');
                        },
                        { timeout: 8000, maximumAge: 60_000 },
                      );
                    }}
                    aria-label="Use my current location"
                    className={`absolute right-2 top-1/2 -translate-y-1/2 text-hd-orange hover:brightness-110 ${
                      geoBusy ? 'animate-pulse' : ''
                    }`}
                  >
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <circle cx="12" cy="12" r="3" />
                      <circle cx="12" cy="12" r="9" />
                      <line x1="12" y1="1" x2="12" y2="4" />
                      <line x1="12" y1="20" x2="12" y2="23" />
                      <line x1="1" y1="12" x2="4" y2="12" />
                      <line x1="20" y1="12" x2="23" y2="12" />
                    </svg>
                  </button>
                </div>
                {geoError && (
                  <p className="text-[10px] text-warning mt-1">{geoError}</p>
                )}
              </Labelled>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Labelled label="State">
                <Select
                  {...register('state', {
                    onChange: () =>
                      setValue('city', '', { shouldValidate: true }),
                  })}
                >
                  <option value="">Select state</option>
                  {INDIA_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Labelled>
              <Labelled label="City">
                <Select
                  disabled={!selectedState}
                  {...register('city', { required: true })}
                >
                  <option value="">
                    {selectedState ? 'Select city' : 'Pick a state first'}
                  </option>
                  {cityOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Labelled>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Labelled label="Pin Code">
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="110053"
                  {...register('pincode', {
                    pattern: { value: /^[0-9]{6}$/, message: '6 digits required' },
                  })}
                />
              </Labelled>
              <Labelled label="Choose Dealer *">
                <Select
                  {...register('dealerId', { required: true })}
                  disabled={dealersQuery.isLoading}
                >
                  <option value="">
                    {dealersQuery.isLoading ? 'Loading dealers…' : 'Select a dealer'}
                  </option>
                  {dealersQuery.data?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} · {d.city}
                    </option>
                  ))}
                </Select>
              </Labelled>
            </div>

            {/* Email is required by the trade-in API but not shown on Frame 28
                — keep it visible but compact, full-width, just above T&C. */}
            <Labelled label="Email">
              <Input
                type="email"
                placeholder="you@example.com"
                {...register('email', { required: true })}
              />
            </Labelled>

            {error && <div className="text-danger text-sm">{error}</div>}

            <label className="flex items-start gap-2 text-xs text-gray-600 leading-relaxed cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-hd-orange shrink-0"
                {...register('acceptedTerms', { required: true })}
              />
              <span>
                I have read, understood and accept the{' '}
                <Link to="/terms" className="text-hd-orange underline hover:brightness-110">
                  Terms and Conditions
                </Link>{' '}
                and{' '}
                <Link to="/privacy" className="text-hd-orange underline hover:brightness-110">
                  Privacy Policy
                </Link>
                .
              </span>
            </label>

            <div className="flex justify-end gap-3 pt-2">
              <Link
                to="/"
                className="border border-gray-300 px-6 py-2.5 font-subhead uppercase tracking-subhead text-xs text-gray-700 hover:border-hd-black hover:text-hd-black transition rounded-card"
              >
                Cancel
              </Link>
              <Button
                type="submit"
                disabled={!formState.isValid || submitting}
              >
                {submitting ? 'Submitting…' : 'Send Enquiry'}
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* OTP-only modal — phone, name, email already collected on the form,
          so the modal skips its own collect step and verifies straight away. */}
      <InfoGateModal
        open={modalOpen}
        purpose="TRADE_IN"
        prefilled={
          modalOpen
            ? {
                phone: getValues('phone'),
                name: getValues('username'),
                email: getValues('email'),
                vin: getValues('vin'),
                bikeModel: getValues('bikeModel'),
                state: getValues('state'),
                city: getValues('city'),
                pincode: getValues('pincode'),
                location: getValues('location'),
                dealerId: getValues('dealerId'),
              }
            : undefined
        }
        onVerified={handleVerified}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}

function Labelled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block font-subhead uppercase tracking-subhead text-[11px] text-gray-600 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
