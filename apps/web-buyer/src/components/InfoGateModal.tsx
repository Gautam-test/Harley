import { useEffect, useState } from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Button, Input, Select } from '@hd-cpo/ui';
import { api, ApiError } from '../lib/api';
import { useOtpStore, type OtpPurpose } from '../store/otp';
import { INDIA_STATES, citiesForState } from '../lib/indiaGeo';
import { HD_MODEL_CATALOG } from '../lib/models';
import { reverseGeocode } from '../lib/reverseGeocode';

interface DealerOption {
  id: string;
  name: string;
  city: string;
}

// PRD §6.1.4 — Info-gate popup. 2-step modal:
//   Step 1: collect contact details + send OTP
//   Step 2: enter the 6-digit OTP, verify, persist verified token, fire onVerified

interface InfoGateModalProps {
  open: boolean;
  purpose: OtpPurpose;
  context?: {
    modelInterest?: string;
    priceRange?: string;
    /** Pre-select this dealer when the modal opens (e.g. the listing's owner). */
    preselectDealerId?: string;
  };
  /**
   * When the caller has already collected the buyer's contact details
   * (e.g. the Sell Bike full-page form), pass them here. The modal then
   * skips its own collection step, sends the OTP immediately, and goes
   * straight to OTP verification. `phone` must be a valid +91 number.
   */
  prefilled?: {
    phone: string;
    name: string;
    email: string;
    city?: string;
    pincode?: string;
    vin?: string;
    state?: string;
    location?: string;
    bikeModel?: string;
    dealerId?: string;
  };
  onVerified: (data: {
    phone: string;
    name: string;
    email: string;
    city?: string;
    pincode?: string;
    vin?: string;
    state?: string;
    location?: string;
    lookingFor?: string;
    description?: string;
    dealerId?: string;
  }) => void;
  onClose?: () => void;
}

interface Step1Values {
  name: string;
  phone: string;
  email: string;
  city: string;
  pincode: string;
  vin: string;
  state: string;
  /** Free-text neighbourhood/locality, e.g. "Connaught Place". */
  location: string;
  lookingFor: string;
  description: string;
  dealerId: string;
}

// Strip everything that isn't a digit, drop the leading "91" if present, then
// cap at 10 digits and re-prefix with "+91". Keeps the field always valid as
// the user types so the Continue button can engage.
function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  // If user pasted "+91 9876…" or "919876…" or "+919876…", strip leading 91.
  const without91 = digits.startsWith('91') ? digits.slice(2) : digits;
  return `+91${without91.slice(0, 10)}`;
}

export function InfoGateModal({
  open,
  purpose,
  context,
  prefilled,
  onVerified,
  onClose,
}: InfoGateModalProps) {
  const setOtp = useOtpStore((s) => s.set);
  // Prefilled flows go straight to OTP entry — the caller has already
  // collected name + phone in their own form (e.g. Sell Bike page).
  const [step, setStep] = useState<'collect' | 'verify'>(
    prefilled ? 'verify' : 'collect',
  );
  const [profile, setProfile] = useState<Step1Values | null>(
    prefilled
      ? {
          name: prefilled.name,
          phone: prefilled.phone,
          email: prefilled.email,
          city: prefilled.city ?? '',
          pincode: prefilled.pincode ?? '',
          vin: prefilled.vin ?? '',
          state: prefilled.state ?? '',
          location: prefilled.location ?? '',
          lookingFor: prefilled.bikeModel ?? '',
          description: '',
          dealerId: prefilled.dealerId ?? '',
        }
      : null,
  );
  const [otpId, setOtpId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // When prefilled, fire the OTP send as soon as the modal opens. Done in a
  // useEffect (not during render) so React doesn't tear-render and lose the
  // resulting otpId — that's why the previous in-render version sometimes
  // left the verify button click without an otpId to verify against.
  //
  // The guard intentionally drops `error` from the deps — the previous
  // version refused to retry once `error` was set, which made a transient
  // network blip a permanent dead-end. The Resend Code button on the
  // verify step now clears `error` + `otpId` and lets this effect re-fire.
  useEffect(() => {
    if (!open || !prefilled || otpId || busy) return;
    let cancelled = false;
    setBusy(true);
    api<{ otpId: string }>('/otp/send', {
      method: 'POST',
      body: JSON.stringify({ phone: prefilled.phone, purpose }),
    })
      .then((res) => {
        if (!cancelled) {
          setOtpId(res.otpId);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : 'Could not send OTP');
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefilled?.phone, purpose, otpId]);

  // 30-second resend cooldown so a buyer who didn't get the SMS within ~30s
  // has a clear "send it again" path instead of refreshing the page (and
  // losing the modal). Resets every time a new otpId is issued.
  const [resendCooldown, setResendCooldown] = useState(30);
  useEffect(() => {
    if (!otpId) return;
    setResendCooldown(30);
    const timer = window.setInterval(() => {
      setResendCooldown((n) => (n > 0 ? n - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpId]);

  const resendOtp = () => {
    if (busy || resendCooldown > 0) return;
    // Clearing otpId + error makes the existing send-effect above re-fire
    // with the same prefilled phone (or whichever phone the buyer entered
    // in step 1).
    setOtpId(null);
    setError(null);
  };

  // Dealers list for the "Choose Dealer" select. Loaded only when the modal
  // is open so we don't fetch eagerly on every page mount.
  const dealersQuery = useQuery({
    enabled: open,
    queryKey: ['public-dealers-options'],
    queryFn: () =>
      api<DealerOption[]>('/dealers?lat=20.5937&lng=78.9629&radius=500'),
    staleTime: 5 * 60 * 1000,
  });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<Step1Values>({
    mode: 'onChange',
    defaultValues: {
      name: '',
      phone: '+91',
      email: '',
      city: '',
      pincode: '',
      vin: '',
      state: '',
      location: '',
      lookingFor: '',
      description: '',
      dealerId: context?.preselectDealerId ?? '',
    },
  });

  // Watch the selected state so the City dropdown can filter to its
  // matching cities. Empty state → empty city list (placeholder only).
  const selectedState = useWatch({ control, name: 'state' });
  const cityOptions = citiesForState(selectedState ?? '');

  // Show the richer "BUYER ENQUIRY" form layout on listing-enquiry purpose;
  // the leaner gate is fine for general info-gate / trade-in.
  const isBuyerEnquiry = purpose === 'ENQUIRY';

  if (!open) return null;

  const submitDetails = async (values: Step1Values) => {
    setBusy(true);
    setError(null);
    try {
      const cleanPhone = normalisePhone(values.phone);
      const res = await api<{ otpId: string }>('/otp/send', {
        method: 'POST',
        body: JSON.stringify({ phone: cleanPhone, purpose }),
      });
      setProfile({ ...values, phone: cleanPhone });
      setOtpId(res.otpId);
      setStep('verify');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send OTP');
    } finally {
      setBusy(false);
    }
  };

  const submitVerify = async () => {
    if (!otpId || !profile) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ verifiedToken: string }>('/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ otpId, code }),
      });
      setOtp(res.verifiedToken, profile.phone, purpose);
      onVerified({
        phone: profile.phone,
        name: profile.name,
        email: profile.email,
        city: profile.city || undefined,
        pincode: profile.pincode || undefined,
        vin: profile.vin || undefined,
        state: profile.state || undefined,
        location: profile.location || undefined,
        lookingFor: profile.lookingFor || undefined,
        description: profile.description || undefined,
        dealerId: profile.dealerId || undefined,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center px-4 py-8 overflow-y-auto">
      <div
        className={`bg-hd-white border-t-4 border-hd-orange ${
          isBuyerEnquiry && step === 'collect' ? 'max-w-xl' : 'max-w-md'
        } w-full p-6 rounded-card shadow-xl my-auto`}
      >
        <div className="flex items-baseline justify-between">
          <h2 className="font-subhead uppercase tracking-subhead text-text-on-light text-xl">
            {step === 'collect'
              ? isBuyerEnquiry
                ? 'Buyer Enquiry'
                : 'Almost There'
              : 'Verify OTP'}
          </h2>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-gray-500 hover:text-text-on-light text-sm"
            >
              ✕
            </button>
          )}
        </div>
        {!isBuyerEnquiry && (
          <p className="text-gray-600 text-sm mt-2">
            {step === 'collect'
              ? 'Quick details so the dealer can reach you. We send a one-time code to confirm your number.'
              : `We sent a 6-digit code to ${profile?.phone}. Enter it below.`}
          </p>
        )}
        {isBuyerEnquiry && step === 'verify' && (
          <p className="text-gray-600 text-sm mt-2">
            {`We sent a 6-digit code to ${profile?.phone}. Enter it below.`}
          </p>
        )}

        {step === 'collect' && (
          <form
            onSubmit={handleSubmit(submitDetails)}
            className={`mt-6 ${isBuyerEnquiry ? 'space-y-4' : 'space-y-3'}`}
            noValidate
          >
            <Labelled label="Full Name" error={errors.name?.message} show={isBuyerEnquiry}>
              <Input
                placeholder={isBuyerEnquiry ? 'Mohit Tai' : 'Full name'}
                aria-invalid={Boolean(errors.name)}
                {...register('name', {
                  required: 'Name is required',
                  minLength: { value: 2, message: 'Enter at least 2 characters' },
                })}
              />
            </Labelled>

            <div className={isBuyerEnquiry ? 'grid grid-cols-2 gap-3' : ''}>
              <Labelled label="Phone Number" error={errors.phone?.message} show={isBuyerEnquiry}>
                <Controller
                  control={control}
                  name="phone"
                  rules={{
                    validate: (v) =>
                      /^\+91[0-9]{10}$/.test(v) || 'Phone must be +91 followed by 10 digits',
                  }}
                  render={({ field }) => (
                    <Input
                      inputMode="tel"
                      maxLength={13}
                      placeholder="+91XXXXXXXXXX"
                      aria-invalid={Boolean(errors.phone)}
                      value={field.value}
                      onBlur={field.onBlur}
                      onChange={(e) => field.onChange(normalisePhone(e.target.value))}
                    />
                  )}
                />
              </Labelled>

              {isBuyerEnquiry && (
                <Labelled label="Email ID" error={errors.email?.message} show>
                  <Input
                    type="email"
                    placeholder="Enter email id"
                    aria-invalid={Boolean(errors.email)}
                    {...register('email', {
                      required: 'Email is required',
                      pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email' },
                    })}
                  />
                </Labelled>
              )}
            </div>

            {!isBuyerEnquiry && (
              <Labelled label="Email ID" error={errors.email?.message} show={false}>
                <Input
                  type="email"
                  placeholder="Email"
                  aria-invalid={Boolean(errors.email)}
                  {...register('email', {
                    required: 'Email is required',
                    pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email' },
                  })}
                />
              </Labelled>
            )}

            {/* Buyer Enquiry layout per Figma /Customer/Frame 173.png — 2-col:
                  row A: LOCATION | STATE
                  row B: CITY     | PIN CODE
                Location is a free-text neighbourhood input with a locator
                affordance; State + City are dependent dropdowns. VIN is
                intentionally absent — that field belongs to the SELLER
                trade-in form (Frame 28), not the buyer enquiry. */}
            {isBuyerEnquiry ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Labelled label="Location" show>
                    <LocationInput
                      register={register('location')}
                      busy={geoBusy}
                      onUseGeolocation={() => {
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
                              // Prefer the human-readable locality; fall back to
                              // raw coords if BigDataCloud returned nothing.
                              setValue('location', r.locality || `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`, {
                                shouldValidate: true,
                              });
                              if (r.state) {
                                setValue('state', r.state, { shouldValidate: true });
                                if (r.city) {
                                  setValue('city', r.city, { shouldValidate: true });
                                } else {
                                  setValue('city', '', { shouldValidate: true });
                                }
                              }
                              if (r.pincode) {
                                setValue('pincode', r.pincode, { shouldValidate: true });
                              }
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
                            // Code 1 = permission denied (silent — user choice).
                            if (err.code !== 1) setGeoError('Could not get your location');
                          },
                          { timeout: 8000, maximumAge: 60_000 },
                        );
                      }}
                    />
                    {geoError && (
                      <p className="text-[10px] text-warning mt-1">{geoError}</p>
                    )}
                  </Labelled>
                  <Labelled label="State" show>
                    <Select
                      {...register('state', {
                        onChange: () => {
                          // Re-pick city if the previous one isn't valid for the
                          // newly-chosen state — prevents stale invalid pairs.
                          setValue('city', '', { shouldValidate: true });
                        },
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
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Labelled label="City" error={errors.city?.message} show>
                    <Select
                      aria-invalid={Boolean(errors.city)}
                      disabled={!selectedState}
                      {...register('city', {
                        required: 'City is required',
                      })}
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
                  <Labelled label="Pin Code" error={errors.pincode?.message} show>
                    <Input
                      placeholder="110053"
                      inputMode="numeric"
                      maxLength={6}
                      aria-invalid={Boolean(errors.pincode)}
                      {...register('pincode', {
                        pattern: { value: /^[0-9]{6}$/, message: '6 digits required' },
                      })}
                    />
                  </Labelled>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Labelled label="Location" show={false}>
                  <Input placeholder="Choose location" {...register('city')} />
                </Labelled>
                <Labelled label="Pincode" error={errors.pincode?.message} show={false}>
                  <Input
                    placeholder="Pincode (6 digits)"
                    inputMode="numeric"
                    maxLength={6}
                    aria-invalid={Boolean(errors.pincode)}
                    {...register('pincode', {
                      pattern: { value: /^[0-9]{6}$/, message: '6 digits required' },
                    })}
                  />
                </Labelled>
              </div>
            )}

            {isBuyerEnquiry && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Labelled label="Looking For" show>
                  <Select {...register('lookingFor')} defaultValue="">
                    <option value="">Select a model</option>
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
                <Labelled label="Choose Dealer *" error={errors.dealerId?.message} show>
                  {/* Auto-selected from the listing context, but the user can
                      override — useful when the listing's dealer is far and
                      the buyer would prefer a closer one. The lead is still
                      tied to the listing's dealer for inventory ownership;
                      the chosen dealer flows through as a routing preference. */}
                  <Select
                    {...register('dealerId', {
                      validate: (v) =>
                        Boolean(v) ||
                        Boolean(context?.preselectDealerId) ||
                        'Please choose a dealer',
                    })}
                    aria-label="Choose dealer"
                    aria-describedby={context?.preselectDealerId ? 'dealer-preselect-hint' : undefined}
                    aria-invalid={Boolean(errors.dealerId)}
                    disabled={dealersQuery.isLoading}
                  >
                    <option value="">
                      {dealersQuery.isLoading ? 'Loading…' : 'Choose Dealer'}
                    </option>
                    {dealersQuery.data?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} · {d.city}
                      </option>
                    ))}
                  </Select>
                  {context?.preselectDealerId && (
                    <p
                      id="dealer-preselect-hint"
                      className="text-[10px] text-gray-500 mt-1 leading-snug"
                    >
                      Auto-selected from this listing &mdash; change if you prefer another dealer.
                    </p>
                  )}
                </Labelled>
              </div>
            )}

            {isBuyerEnquiry && (
              <Labelled label="Description" show>
                <textarea
                  rows={3}
                  placeholder="Add description here…"
                  className="w-full bg-hd-white border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hd-orange/50"
                  {...register('description')}
                />
              </Labelled>
            )}

            {error && (
              <div className="text-danger text-sm bg-danger/10 border border-danger px-3 py-2 rounded">
                {error}
              </div>
            )}
            <p className="text-xs text-gray-500">
              <input
                type="checkbox"
                defaultChecked
                className="mr-1.5 align-middle accent-hd-orange"
                aria-label="I have read and understood the Terms and Conditions and Privacy Policy"
              />
              I have read &amp; understood the{' '}
              <a href="/terms" className="text-hd-orange hover:underline">
                Terms &amp; Conditions
              </a>{' '}
              and{' '}
              <a href="/privacy" className="text-hd-orange hover:underline">
                Privacy Policy
              </a>
              .
            </p>
            <div
              className={`flex ${isBuyerEnquiry ? 'justify-end gap-3' : ''} ${isBuyerEnquiry ? '' : ''}`}
            >
              {isBuyerEnquiry && onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="border border-gray-300 px-6 py-2.5 font-subhead uppercase tracking-subhead text-xs text-gray-700 hover:border-hd-black hover:text-hd-black transition rounded-card"
                >
                  Cancel
                </button>
              )}
              <Button
                type="submit"
                disabled={busy}
                className={isBuyerEnquiry ? '' : 'w-full'}
              >
                {busy ? 'Sending OTP…' : isBuyerEnquiry ? 'Send Enquiry' : 'Continue'}
              </Button>
            </div>
          </form>
        )}

        {step === 'verify' && (
          <div className="mt-6 space-y-3">
            <Input
              placeholder="6-digit code"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="text-center text-2xl tracking-[0.5em] font-mono"
            />
            {error && (
              <div className="text-danger text-sm bg-danger/10 border border-danger px-3 py-2 rounded">
                {error}
              </div>
            )}
            <Button
              type="button"
              onClick={submitVerify}
              disabled={code.length !== 6 || busy}
              className="w-full"
            >
              {busy ? 'Verifying…' : 'Verify'}
            </Button>
            {/* Resend Code — gated by a 30s cooldown so a tap-happy buyer
                doesn't spam /otp/send and trip the rate limit. After the
                countdown the link enables; clicking nukes the otpId so the
                send-effect re-fires with the same phone. */}
            <button
              type="button"
              onClick={resendOtp}
              disabled={resendCooldown > 0 || busy}
              className="text-xs text-gray-600 hover:text-hd-orange w-full disabled:text-gray-400 disabled:hover:text-gray-400"
            >
              {resendCooldown > 0
                ? `Didn't get it? Resend in ${resendCooldown}s`
                : "Didn't get it? Resend code"}
            </button>
            <button
              type="button"
              onClick={() => setStep('collect')}
              className="text-xs text-gray-600 hover:text-hd-orange w-full"
            >
              ← Edit details
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LocationInput({
  register,
  onUseGeolocation,
  busy = false,
}: {
  register: ReturnType<ReturnType<typeof useForm<Step1Values>>['register']>;
  onUseGeolocation: () => void;
  busy?: boolean;
}) {
  return (
    <div className="relative">
      <Input
        placeholder={busy ? 'Locating…' : 'Choose location'}
        {...register}
        className="pr-10"
        readOnly={busy}
      />
      <button
        type="button"
        onClick={onUseGeolocation}
        disabled={busy}
        aria-label="Use my current location"
        className={`absolute right-2 top-1/2 -translate-y-1/2 text-hd-orange hover:brightness-110 ${
          busy ? 'animate-pulse' : ''
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
  );
}

function Field({
  error,
  hint,
  children,
}: {
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {children}
      {error ? (
        <p className="text-xs text-danger mt-1">{error}</p>
      ) : hint ? (
        <p className="text-xs text-gray-500 mt-1">{hint}</p>
      ) : null}
    </div>
  );
}

// Wraps a field with the freeze design's mini-label-above pattern. When `show`
// is false (compact mode), the label is hidden and we fall back to the bare
// Field wrapper that just shows error/hint underneath.
function Labelled({
  label,
  error,
  show = true,
  children,
}: {
  label: string;
  error?: string;
  show?: boolean;
  children: React.ReactNode;
}) {
  if (!show) return <Field error={error}>{children}</Field>;
  return (
    <div>
      <label className="block font-subhead uppercase tracking-subhead text-[11px] text-gray-600 mb-1.5">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
    </div>
  );
}
