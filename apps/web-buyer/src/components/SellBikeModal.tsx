import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button, Input, Select } from '@hd-cpo/ui';
import { api, ApiError } from '../lib/api';
import { InfoGateModal } from './InfoGateModal';
import { HD_MODEL_CATALOG } from '../lib/models';
import { INDIA_STATES, citiesForState } from '../lib/indiaGeo';
import { reverseGeocode } from '../lib/reverseGeocode';
import { useSellBikeStore } from '../store/sellBike';

// "Tell Us About Your Bike" trade-in form per Figma /Customer/Frame 28.png.
// Mounted globally and triggered via useSellBikeStore so any nav link can
// open it. Two-step flow:
//   1. This modal collects all bike + seller details (single screen).
//   2. On Send Enquiry, an InfoGateModal opens for OTP-only verification —
//      we never re-ask for name/phone/email here.
//
// Form lifts into the InfoGateModal via the `prefilled` prop; conditional
// render (`{otpOpen && …}`) ensures the inner modal mounts fresh each time
// so its useState initialiser sees `prefilled` set.

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

export function SellBikeModal() {
  const { open, closeSellBike } = useSellBikeStore();
  const { register, handleSubmit, formState, getValues, setValue, control, reset } =
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

  const [otpOpen, setOtpOpen] = useState(false);
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

  const selectedState = useWatch({ control, name: 'state' });
  const cityOptions = citiesForState(selectedState ?? '');

  const onSubmit = () => setOtpOpen(true);

  const handleVerified = async (data: { phone: string }) => {
    setOtpOpen(false);
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

  const handleClose = () => {
    closeSellBike();
    // Reset for the next time the modal opens — start with a clean form
    // unless we're showing the success state, in which case keep it visible
    // until the user actively dismisses (then reset).
    setTimeout(() => {
      reset();
      setSubmitted(null);
      setError(null);
      setOtpOpen(false);
    }, 200);
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center px-4 py-8 overflow-y-auto">
        <div className="bg-hd-white border-t-4 border-hd-orange max-w-2xl w-full p-4 sm:p-6 md:p-7 rounded-card shadow-xl my-auto">
          <div className="flex items-baseline justify-between">
            <h2 className="font-subhead uppercase tracking-subhead text-text-on-light text-xl">
              Tell Us About Your Motorcycle
            </h2>
            <button
              onClick={handleClose}
              aria-label="Close"
              className="text-gray-500 hover:text-text-on-light text-lg"
            >
              ✕
            </button>
          </div>

          {submitted ? (
            <div className="mt-6">
              <div className="bg-hd-orange/10 border border-hd-orange/40 rounded-card p-4 flex items-start gap-3">
                <span
                  aria-hidden
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-hd-orange text-hd-black font-bold shrink-0"
                >
                  ✓
                </span>
                <div>
                  <p className="font-subhead uppercase tracking-subhead text-sm text-text-on-light">
                    Enquiry Sent
                  </p>
                  <p className="text-sm text-gray-700 mt-1 leading-relaxed">
                    An authorised H-D dealer will reach out within 48 hours.
                  </p>
                </div>
              </div>
              <div className="mt-4 border-t border-gray-200 pt-3">
                <p className="font-subhead uppercase tracking-subhead text-[10px] text-gray-500">
                  Reference ID
                </p>
                <code className="block font-mono text-sm break-all mt-1">
                  {submitted.id}
                </code>
              </div>
              <div className="flex justify-end gap-3 mt-5">
                <button
                  type="button"
                  onClick={handleClose}
                  className="border border-gray-300 px-6 py-2.5 font-subhead uppercase tracking-subhead text-xs text-gray-700 hover:border-hd-black hover:text-hd-black transition rounded-card"
                >
                  Close
                </button>
                <Link
                  to={`/track?id=${submitted.id}`}
                  onClick={handleClose}
                  className="bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead text-xs px-5 py-2.5 rounded-card hover:brightness-110 transition"
                >
                  Track Enquiry →
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
              <Labelled label="Your Name" required>
                <Input
                  placeholder="Mohd Tai"
                  {...register('username', { required: true, minLength: 2 })}
                />
              </Labelled>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Labelled label="Motorcycle Model" required>
                  <Select {...register('bikeModel', { required: true })}>
                    <option value="">Choose motorcycle model</option>
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
                <Labelled
                  label="VIN Number"
                  required
                  hint="17 characters · letters + numbers · no I, O, Q"
                >
                  <Input
                    maxLength={17}
                    placeholder="e.g. 1HD1KB4197Y624381"
                    className="font-mono uppercase"
                    {...register('vin', {
                      required: true,
                      pattern: /^[A-HJ-NPR-Z0-9]{17}$/,
                    })}
                  />
                </Labelled>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Labelled label="Phone Number" required>
                  <Input
                    inputMode="tel"
                    maxLength={13}
                    placeholder="Enter phone number"
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
                              setValue('location', r.locality || `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`, { shouldValidate: true });
                              if (r.state) {
                                setValue('state', r.state, { shouldValidate: true });
                                setValue('city', r.city ?? '', { shouldValidate: true });
                              }
                              if (r.pincode) setValue('pincode', r.pincode, { shouldValidate: true });
                              if (r.countryCode && r.countryCode !== 'IN') {
                                setGeoError('Outside India — please enter address manually.');
                              }
                            } catch (e) {
                              setGeoError(e instanceof Error ? e.message : 'Could not resolve location');
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
                      className={`absolute right-2 top-1/2 -translate-y-1/2 text-hd-orange hover:brightness-110 ${geoBusy ? 'animate-pulse' : ''}`}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <Labelled label="City" required>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <Labelled label="Choose Dealer" required>
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

              <Labelled label="Email" required>
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
                  {/* External links so the modal stays mounted with all
                      the user's typed data; previously these were
                      <Link to=> which client-side-routed away and
                      destroyed the in-flight enquiry form (QA bug 2). */}
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-hd-orange underline hover:brightness-110"
                  >
                    Terms and Conditions
                  </a>{' '}
                  and{' '}
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-hd-orange underline hover:brightness-110"
                  >
                    Privacy Policy
                  </a>
                  .
                </span>
              </label>

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  className="border border-gray-300 px-6 py-2.5 font-subhead uppercase tracking-subhead text-xs text-gray-700 hover:border-hd-black hover:text-hd-black transition rounded-card"
                >
                  Cancel
                </button>
                <Button type="submit" disabled={!formState.isValid || submitting}>
                  {submitting ? 'Submitting…' : 'Send Enquiry'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* OTP-only verification — phone, name, email already collected above. */}
      {otpOpen && (
        <InfoGateModal
          open
          purpose="TRADE_IN"
          prefilled={{
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
          }}
          onVerified={handleVerified}
          onClose={() => setOtpOpen(false)}
        />
      )}
    </>
  );
}

function Labelled({
  label,
  hint,
  required = false,
  children,
}: {
  label: string;
  /** Small grey caption rendered under the field — used for format hints
      like "17 characters, no I/O/Q" on the VIN input. */
  hint?: string;
  /** Renders a small red asterisk after the label so users learn the
      field is required up-front instead of via a submit error. */
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block font-subhead uppercase tracking-subhead text-[11px] text-gray-600 mb-1.5">
        {label}
        {required && <span className="text-danger ml-0.5" aria-hidden>*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-gray-500">{hint}</p>}
    </div>
  );
}
