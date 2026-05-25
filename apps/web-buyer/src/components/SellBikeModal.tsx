import { useEffect, useRef, useState } from 'react';
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
import {
  nameRules,
  phoneRules,
  emailRules,
  vinRules,
  optionalPincodeRules,
  requiredSelect,
  termsCheckboxRules,
} from '../lib/formRules';

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
  pincode: string;
}

function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const without91 = digits.startsWith('91') ? digits.slice(2) : digits;
  return `+91${without91.slice(0, 10)}`;
}

export function SellBikeModal() {
  const { open, closeSellBike } = useSellBikeStore();
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    getValues,
    setValue,
    control,
    reset,
  } = useForm<FormValues>({
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

  // QA RE-OPEN bug #5 — dealer auto-pick. Watches the buyer's State,
  // City, Pincode, and Location fields and, when at least one of them
  // is set, picks the dealer whose pincode/city matches most closely.
  // Priority: exact pincode > city match > first dealer (fallback).
  // Will NOT override a dealer the user explicitly chose — we set
  // `autoPickedRef` after the first auto-write and bail if the user
  // has since changed dealerId to anything else.
  const selectedCity = useWatch({ control, name: 'city' });
  const selectedPincode = useWatch({ control, name: 'pincode' });
  const currentDealerId = useWatch({ control, name: 'dealerId' });
  const autoPickedRef = useRef<string | null>(null);
  useEffect(() => {
    const dealers = dealersQuery.data;
    if (!dealers || dealers.length === 0) return;
    // Has the user picked a dealer themselves? If currentDealerId is
    // set to something that wasn't our last auto-pick, treat the field
    // as manually owned and stop auto-writing.
    if (currentDealerId && currentDealerId !== autoPickedRef.current) {
      return;
    }
    // Need at least one geo signal before suggesting a dealer.
    if (!selectedCity && !selectedPincode && !selectedState) return;

    const cityLower = (selectedCity ?? '').trim().toLowerCase();
    const pincodeStr = (selectedPincode ?? '').trim();
    const match =
      (pincodeStr && dealers.find((d) => d.pincode === pincodeStr)) ||
      (cityLower && dealers.find((d) => d.city.toLowerCase() === cityLower)) ||
      null;
    if (match && match.id !== currentDealerId) {
      setValue('dealerId', match.id, { shouldValidate: true, shouldDirty: true });
      autoPickedRef.current = match.id;
    }
  }, [
    dealersQuery.data,
    selectedCity,
    selectedPincode,
    selectedState,
    currentDealerId,
    setValue,
  ]);

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
      {/* QA RE-OPEN responsive: pb-12 sm:pb-8 ensures the Send Enquiry
          CTA never clips under the mobile browser chrome / safe area.
          The overflow-y-auto + my-auto pattern centres content but the
          extra bottom pad gives wiggle room above the address bar. */}
      <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center px-3 sm:px-4 pt-6 pb-12 sm:py-8 overflow-y-auto">
        <div className="bg-hd-white border-t-4 border-hd-orange max-w-2xl w-full p-4 sm:p-6 md:p-7 shadow-xl my-auto">
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
              <div className="bg-hd-orange/10 border border-hd-orange/40 p-4 flex items-start gap-3">
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
                  className="border border-gray-300 px-6 py-2.5 font-subhead uppercase tracking-subhead text-xs text-gray-700 hover:border-hd-black hover:text-hd-black transition"
                >
                  Close
                </button>
                <Link
                  to={`/track?id=${submitted.id}`}
                  onClick={handleClose}
                  className="bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead text-xs px-5 py-2.5 hover:brightness-110 transition"
                >
                  Track Enquiry →
                </Link>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit(onSubmit)}
              // QA NEW: Figma renders every input + select with a heavy
              // 2px black border. Applied via descendant variants so we
              // don't have to override every Input className individually.
              className="mt-5 space-y-4 [&_input]:!border-2 [&_input]:!border-hd-black [&_select]:!border-2 [&_select]:!border-hd-black"
            >
              <Labelled label="Your Name" required error={errors.username?.message}>
                <Input
                  placeholder="Mohd Tai"
                  maxLength={100}
                  aria-invalid={Boolean(errors.username)}
                  {...register('username', nameRules)}
                />
              </Labelled>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Labelled label="Motorcycle Model" required error={errors.bikeModel?.message}>
                  <Select
                    aria-invalid={Boolean(errors.bikeModel)}
                    {...register('bikeModel', requiredSelect('a motorcycle model'))}
                  >
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
                <Labelled label="VIN Number" required error={errors.vin?.message}>
                  {/* Single-line placeholder per Figma — drop the
                      multi-line "17 characters · letters + numbers · no
                      I, O, Q" hint that cluttered the field. Validator
                      below still enforces the rule. */}
                  <Input
                    maxLength={17}
                    placeholder="Enter Motorcycle vin number"
                    className="font-mono uppercase"
                    aria-invalid={Boolean(errors.vin)}
                    {...register('vin', {
                      ...vinRules,
                      onChange: (e) =>
                        setValue('vin', String(e.target.value).toUpperCase(), {
                          shouldValidate: true,
                        }),
                    })}
                  />
                </Labelled>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Labelled label="Phone Number" required error={errors.phone?.message}>
                  <Input
                    inputMode="tel"
                    maxLength={13}
                    placeholder="Enter phone number"
                    aria-invalid={Boolean(errors.phone)}
                    {...register('phone', {
                      ...phoneRules,
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

              {/* QA NEW: Figma renders State + City as flat editable
                  text inputs (not dropdown selectors). Buyer types their
                  state and city directly. The cityOptions / selectedState
                  watches still exist but are now only used by the dealer
                  auto-pick effect — not the UI. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Labelled label="State" required error={errors.state?.message}>
                  <Input
                    placeholder="Enter state"
                    aria-invalid={Boolean(errors.state)}
                    {...register('state', {
                      required: 'State is required',
                      onChange: () =>
                        setValue('city', getValues('city') ?? '', { shouldValidate: false }),
                    })}
                  />
                </Labelled>
                <Labelled label="City" required error={errors.city?.message}>
                  <Input
                    placeholder="Enter city"
                    aria-invalid={Boolean(errors.city)}
                    {...register('city', { required: 'City is required' })}
                  />
                </Labelled>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Labelled label="Pin Code" error={errors.pincode?.message}>
                  <Input
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="110053"
                    aria-invalid={Boolean(errors.pincode)}
                    {...register('pincode', optionalPincodeRules)}
                  />
                </Labelled>
                <Labelled label="Choose Dealer" required error={errors.dealerId?.message}>
                  <Select
                    aria-invalid={Boolean(errors.dealerId)}
                    {...register('dealerId', requiredSelect('a dealer'))}
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

              {/* QA NEW: EMAIL field removed — Figma Frame 28 doesn't
                  carry an email input on the Sell Bike modal (dealer
                  contacts the seller by phone only). The form's email
                  value still defaults to '' so the API contract that
                  accepts an optional email stays unbroken. */}

              {error && <div className="text-danger text-sm">{error}</div>}

              <label className="flex items-start gap-2 text-xs text-gray-600 leading-relaxed cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-hd-orange shrink-0"
                  aria-invalid={Boolean(errors.acceptedTerms)}
                  {...register('acceptedTerms', termsCheckboxRules)}
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

              {/* QA NEW: Cancel as bordered black outline (square corners),
                  Send Enquiry as solid orange + bold uppercase "SEND
                  ENQUIRY" per Figma. The Button component already
                  defaults to font-subhead + uppercase + tracking-subhead;
                  we add font-bold so it reads as full-weight. */}
              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  className="border-2 border-hd-black px-8 py-2.5 font-subhead font-bold uppercase tracking-subhead text-xs text-hd-black hover:bg-hd-black hover:text-hd-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!isValid || submitting}
                  className="bg-hd-orange text-hd-black px-8 py-2.5 font-subhead font-bold uppercase tracking-subhead text-xs hover:brightness-110 transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Submitting…' : 'Send Enquiry'}
                </button>
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

// QA NEW (Sell Bike Figma): labels are text-only — no red asterisk
// suffix per Figma. `required` is still accepted for backward-compat
// but no longer visually decorates the label. The hint slot is also
// dropped from the visible UI (Figma shows clean single-line
// placeholders); we keep the prop in the signature so the VIN field's
// hint can still be passed without breaking callers.
function Labelled({
  label,
  error,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block font-subhead font-bold tracking-subhead uppercase text-[11px] text-text-on-light mb-1.5">
        {label}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-[11px] text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
