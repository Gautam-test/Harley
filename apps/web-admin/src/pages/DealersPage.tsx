import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, IconButton, Input, Select } from '@hd-cpo/ui';
import { api, ApiError } from '../lib/api';
import { reverseGeocode } from '../lib/reverseGeocode';

interface DealerRow {
  id: string;
  username: string;
  name: string;
  city: string;
  email: string;
  phone: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  createdAt: string;
}

export function DealersPage() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [generated, setGenerated] = useState<{ username: string; password: string } | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-dealers', statusFilter, q],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (statusFilter) sp.set('status', statusFilter);
      if (q) sp.set('q', q);
      return api<DealerRow[]>(`/admin/dealers?${sp.toString()}`);
    },
  });

  const setStatus = useMutation({
    mutationFn: (vars: { id: string; status: DealerRow['status'] }) =>
      api(`/admin/dealers/${vars.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: vars.status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-dealers'] }),
  });

  const resetPwd = useMutation({
    mutationFn: (id: string) =>
      api<{ id: string; generatedPassword: string }>(`/admin/dealers/${id}/reset-password`, {
        method: 'POST',
      }),
    onSuccess: (data, id) => {
      const dealer = (data as unknown as { id: string; generatedPassword: string });
      const username = (qc.getQueryData<DealerRow[]>(['admin-dealers', statusFilter, q]) ?? [])
        .find((d) => d.id === id)?.username ?? 'dealer';
      setGenerated({ username, password: dealer.generatedPassword });
    },
  });

  return (
    <div className="max-w-container mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="flex items-baseline justify-between flex-wrap gap-4 mb-6">
        <h1 className="font-headline text-3xl tracking-headline text-text-on-light">Dealers</h1>
        <div className="flex items-center gap-3">
          <Input
            placeholder="Search name, username, city"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-64"
          />
          <Select
            className="w-40"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="SUSPENDED">Suspended</option>
          </Select>
          <Button onClick={() => setShowCreate(true)}>+ Add Dealer</Button>
        </div>
      </div>

      {generated && (
        <div className="bg-warning/10 border border-warning p-4 mb-6">
          <p className="font-subhead text-text-on-light">
            New password generated for <code>{generated.username}</code>:
          </p>
          <p className="font-mono text-2xl mt-2">{generated.password}</p>
          <p className="text-xs text-gray-600 mt-2">
            Send to the dealer securely. This won&rsquo;t be shown again.
          </p>
          <button
            onClick={() => setGenerated(null)}
            className="text-xs text-hd-orange hover:underline mt-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 7 cols → 4. Dealer cell folds name + username + city; Contact
          cell stacks email + phone; Status is a badge; Actions are
          icon-only with hover tooltips. Only legal transitions render
          per row's current status so admins never see a no-op button. */}
      <div className="bg-hd-white border border-gray-200 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50/80 text-text-on-light">
            <tr>
              <Th>Dealer</Th>
              <Th>Contact</Th>
              <Th>Status</Th>
              <Th className="text-right pr-4">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={4} className="text-center py-8 text-gray-500">Loading…</td>
              </tr>
            )}
            {!isLoading && data?.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-12 text-gray-500">
                  No dealers match.
                </td>
              </tr>
            )}
            {data?.map((d) => (
              <tr key={d.id} className="hover:bg-hd-orange/5 transition-colors">
                <Td>
                  <div className="flex items-start gap-3">
                    {/* Person silhouette avatar — bordered light-grey square
                        so the row never looks broken (rule #7). */}
                    <div className="w-10 h-10 bg-gray-100 rounded overflow-hidden flex-shrink-0 flex items-center justify-center border border-gray-200">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className="w-5 h-5 text-gray-400"
                        aria-hidden
                      >
                        <circle cx="12" cy="8" r="4" />
                        <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className="font-subhead uppercase tracking-subhead text-[13px] text-text-on-light leading-tight truncate"
                        title={d.name}
                      >
                        {d.name}
                      </div>
                      <div className="font-mono text-[11px] text-gray-600 mt-0.5 truncate" title={d.username}>
                        @{d.username}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5 truncate" title={d.city}>
                        {d.city || '—'}
                      </div>
                    </div>
                  </div>
                </Td>
                <Td>
                  <a
                    href={`mailto:${d.email}`}
                    className="block text-[11px] text-text-on-light hover:text-hd-orange leading-tight truncate max-w-[220px]"
                    title={d.email}
                  >
                    {d.email}
                  </a>
                  <a
                    href={`tel:${d.phone.replace(/\s+/g, '')}`}
                    className="block font-mono text-[11px] text-gray-500 hover:text-hd-orange leading-tight mt-0.5 whitespace-nowrap"
                  >
                    {d.phone}
                  </a>
                </Td>
                <Td>
                  <StatusBadge status={d.status} />
                  <div className="text-[10px] text-gray-500 mt-1.5 whitespace-nowrap">
                    {new Date(d.createdAt).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </div>
                </Td>
                <Td className="text-right pr-4">
                  <div className="inline-flex items-center justify-end gap-1.5">
                    {d.status !== 'ACTIVE' && (
                      <IconButton
                        label="Activate"
                        tone="primary"
                        onClick={() => setStatus.mutate({ id: d.id, status: 'ACTIVE' })}
                      >
                        <PowerIcon />
                      </IconButton>
                    )}
                    {d.status !== 'INACTIVE' && (
                      <IconButton
                        label="Set Inactive"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Mark "${d.name}" as Inactive? They will be unable to sign in until you reactivate the account.`,
                            )
                          ) {
                            setStatus.mutate({ id: d.id, status: 'INACTIVE' });
                          }
                        }}
                      >
                        <PauseIcon />
                      </IconButton>
                    )}
                    {d.status !== 'SUSPENDED' && (
                      <IconButton
                        label="Suspend"
                        tone="danger"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Suspend "${d.name}"? They will be blocked from signing in until reactivated.`,
                            )
                          ) {
                            setStatus.mutate({ id: d.id, status: 'SUSPENDED' });
                          }
                        }}
                      >
                        <BanIcon />
                      </IconButton>
                    )}
                    <IconButton
                      label="Reset Password"
                      onClick={() => resetPwd.mutate(d.id)}
                    >
                      <KeyIcon />
                    </IconButton>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateDealerModal
          onClose={() => setShowCreate(false)}
          onCreated={(creds) => {
            setShowCreate(false);
            if (creds) setGenerated(creds);
            qc.invalidateQueries({ queryKey: ['admin-dealers'] });
          }}
        />
      )}
    </div>
  );
}

function CreateDealerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (creds: { username: string; password: string } | null) => void;
}) {
  // BUG-029: mode:'onSubmit' + reValidateMode:'onChange' — errors shown
  // only after first submit attempt, then update live as the admin
  // corrects each field. Prevents false red on first open.
  const { register, handleSubmit, watch, setValue, getValues, formState: { errors, isValid, isSubmitting, isSubmitted }, setError: setFieldError } = useForm<{
    username: string;
    name: string;
    email: string;
    phone: string;
    city: string;
    pincode: string;
    state?: string;
    address?: string;
    torqueDealerId?: string;
  }>({ mode: 'onSubmit', reValidateMode: 'onChange' });
  const [error, setError] = useState<string | null>(null);
  const [pincodeLookup, setPincodeLookup] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // 📍 Use my current location — fills City + State + Pincode from
  // browser geolocation + BigDataCloud reverse geocoding (same pattern
  // as buyer SellBikeModal).
  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation not supported by this browser');
      return;
    }
    setGeoBusy(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          if (r.city) setValue('city', r.city, { shouldValidate: true });
          if (r.state) setValue('state', r.state);
          if (r.pincode) setValue('pincode', r.pincode, { shouldValidate: true });
          if (r.countryCode && r.countryCode !== 'IN') {
            setGeoError('Outside India — please verify the address manually.');
          }
        } catch (e) {
          setGeoError(e instanceof Error ? e.message : 'Could not resolve location');
        } finally {
          setGeoBusy(false);
        }
      },
      (err) => {
        setGeoBusy(false);
        if (err.code === 1) setGeoError('Location permission denied');
        else setGeoError('Could not get your location');
      },
      { timeout: 8000, maximumAge: 60_000 },
    );
  };

  // Auto-fill City + State when pincode reaches 6 valid digits.
  // Uses postalpincode.in — free, CORS-enabled, no API key. Only fills
  // empty fields so the admin can still override after autofill.
  const watchedPincode = watch('pincode');
  useEffect(() => {
    if (!watchedPincode || !/^\d{6}$/.test(watchedPincode)) {
      setPincodeLookup('idle');
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setPincodeLookup('loading');
      try {
        const res = await fetch(`https://api.postalpincode.in/pincode/${watchedPincode}`);
        const json = (await res.json()) as Array<{ Status: string; PostOffice?: Array<{ District: string; State: string }> }>;
        if (cancelled) return;
        const po = json?.[0]?.PostOffice?.[0];
        if (po) {
          const current = getValues();
          if (!current.city) setValue('city', po.District, { shouldValidate: true });
          if (!current.state) setValue('state', po.State);
          setPincodeLookup('done');
        } else {
          setPincodeLookup('error');
        }
      } catch {
        if (!cancelled) setPincodeLookup('error');
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [watchedPincode, setValue, getValues]);
  const create = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api<{ id: string; username: string; generatedPassword: string | null }>('/admin/dealers', {
        method: 'POST',
        body: JSON.stringify(values),
      }),
    onSuccess: (res) => {
      onCreated(res.generatedPassword ? { username: res.username, password: res.generatedPassword } : null);
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        // Surface per-field server errors when the API returns Zod field errors
        // in the message JSON (VALIDATION_ERROR format). Fall back to generic.
        try {
          const parsed = JSON.parse(e.message) as {
            fieldErrors?: Record<string, string[]>;
          };
          if (parsed.fieldErrors && typeof parsed.fieldErrors === 'object') {
            Object.entries(parsed.fieldErrors).forEach(([field, msgs]) => {
              if (Array.isArray(msgs) && msgs.length) {
                setFieldError(
                  field as Parameters<typeof setFieldError>[0],
                  { message: msgs[0] },
                );
              }
            });
            return;
          }
        } catch {
          // message wasn't JSON — fall through to generic error
        }
        setError(e.message);
      } else {
        setError('Could not create');
      }
    },
  });
  return (
    <Modal onClose={onClose} title="Add Dealer">
      <form
        onSubmit={handleSubmit((v) => {
          // Phone: admin types 10 digits, API requires +91XXXXXXXXXX.
          const normalised = { ...v, phone: v.phone.startsWith('+') ? v.phone : `+91${v.phone}` };
          create.mutate(normalised);
        })}
        className="space-y-4"
      >
        <label className="block">
          <span className="block font-subhead uppercase tracking-subhead text-[11px] text-gray-600 mb-1">
            Username <span className="text-danger">*</span>
          </span>
          <Input
            placeholder="e.g. gurgaon-hd"
            aria-invalid={Boolean(errors.username)}
            {...register('username', {
              required: 'Username is required',
              pattern: {
                value: /^[a-z0-9][a-z0-9_-]{1,62}$/,
                message: 'Lowercase letters, numbers and hyphens only — no uppercase or spaces',
              },
            })}
            // Real-time auto-lowercase + strip invalid chars so the input
            // VISUALLY shows only allowed characters as the admin types.
            onChange={(e) => {
              const cleaned = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '');
              e.target.value = cleaned;
              void register('username').onChange(e);
            }}
          />
          {errors.username && <p className="text-danger text-xs mt-1">{errors.username.message}</p>}
        </label>
        <label className="block">
          <span className="block font-subhead uppercase tracking-subhead text-[11px] text-gray-600 mb-1">
            Dealer Name <span className="text-danger">*</span>
          </span>
          <Input
            placeholder="e.g. Capital Harley-Davidson Gurgaon"
            aria-invalid={Boolean(errors.name)}
            {...register('name', {
              required: 'Dealer name is required',
              pattern: {
                value: /^[A-Za-z\s\-'.]+$/,
                message: 'Dealer name must contain letters and spaces only — no numbers or special characters',
              },
            })}
            // Strip digits + invalid chars in real time so typing
            // "Capital123" → "Capital", "Test@HD" → "TestHD".
            onChange={(e) => {
              const cleaned = e.target.value.replace(/[^A-Za-z\s\-'.]/g, '');
              e.target.value = cleaned;
              void register('name').onChange(e);
            }}
          />
          {errors.name && <p className="text-danger text-xs mt-1">{errors.name.message}</p>}
        </label>
        <label className="block">
          <span className="block font-subhead uppercase tracking-subhead text-[11px] text-gray-600 mb-1">
            Email <span className="text-danger">*</span>
          </span>
          <Input
            type="email"
            placeholder="dealer@example.com"
            aria-invalid={Boolean(errors.email)}
            {...register('email', {
              required: 'Email is required',
              pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, message: 'Enter a valid email address' },
            })}
          />
          {errors.email && <p className="text-danger text-xs mt-1">{errors.email.message}</p>}
        </label>
        <label className="block">
          <span className="block font-subhead uppercase tracking-subhead text-[11px] text-gray-600 mb-1">
            Phone <span className="text-danger">*</span>
          </span>
          {/* BUG-032: fixed "+91 " prefix displayed inside the input
              (non-editable). Admin types 10 digits; non-numeric keys
              are stripped real-time. Submit prepends +91 before API. */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-text-on-light text-sm pointer-events-none select-none">
              +91
            </span>
            <Input
              placeholder="9876543210"
              inputMode="numeric"
              maxLength={10}
              aria-invalid={Boolean(errors.phone)}
              className="pl-12"
              {...register('phone', {
                required: 'Phone number is required',
                pattern: {
                  value: /^[0-9]{10}$/,
                  message: 'Phone must be exactly 10 digits',
                },
              })}
              // Real-time strip non-numeric so the input visually
              // rejects letters/spaces/special chars as they're typed.
              onChange={(e) => {
                const cleaned = e.target.value.replace(/\D/g, '').slice(0, 10);
                e.target.value = cleaned;
                void register('phone').onChange(e);
              }}
            />
          </div>
          {errors.phone && <p className="text-danger text-xs mt-1">{errors.phone.message}</p>}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block font-subhead uppercase tracking-subhead text-[11px] text-gray-600 mb-1 flex items-center justify-between">
              <span>City <span className="text-danger">*</span></span>
              <button
                type="button"
                onClick={useMyLocation}
                disabled={geoBusy}
                className={`text-hd-orange hover:brightness-110 text-[10px] inline-flex items-center gap-1 normal-case font-normal tracking-normal ${geoBusy ? 'animate-pulse' : ''}`}
                title="Use my current location"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {geoBusy ? 'Locating…' : 'Use my location'}
              </button>
            </span>
            <Input
              placeholder={geoBusy ? 'Locating…' : 'Gurgaon'}
              aria-invalid={Boolean(errors.city)}
              {...register('city', {
                required: 'City is required',
                pattern: {
                  value: /^[A-Za-z\s\-'.]+$/,
                  message: 'City must contain letters and spaces only',
                },
              })}
              // Strip digits + special chars in real time so the input
              // only ever shows letters, spaces, hyphens and apostrophes.
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^A-Za-z\s\-'.]/g, '');
                e.target.value = cleaned;
                void register('city').onChange(e);
              }}
            />
            {errors.city && <p className="text-danger text-xs mt-1">{errors.city.message}</p>}
            {geoError && <p className="text-warning text-xs mt-1">{geoError}</p>}
          </label>
          <label className="block">
            <span className="block font-subhead uppercase tracking-subhead text-[11px] text-gray-600 mb-1">
              Pincode <span className="text-danger">*</span>
            </span>
            <Input
              placeholder="122001"
              maxLength={6}
              inputMode="numeric"
              aria-invalid={Boolean(errors.pincode)}
              {...register('pincode', {
                required: 'Pincode is required',
                pattern: { value: /^[0-9]{6}$/, message: 'Pincode must be exactly 6 digits' },
              })}
              // Strip non-digits in real time so only numbers can be typed.
              onChange={(e) => {
                const cleaned = e.target.value.replace(/\D/g, '').slice(0, 6);
                e.target.value = cleaned;
                void register('pincode').onChange(e);
              }}
            />
            {errors.pincode && <p className="text-danger text-xs mt-1">{errors.pincode.message}</p>}
            {pincodeLookup === 'loading' && <p className="text-xs text-gray-500 mt-1">Looking up city…</p>}
            {pincodeLookup === 'done' && <p className="text-xs text-success mt-1">✓ City & State auto-filled</p>}
            {pincodeLookup === 'error' && <p className="text-xs text-warning mt-1">Pincode not found — fill city manually</p>}
          </label>
        </div>
        <label className="block">
          <span className="block font-subhead uppercase tracking-subhead text-[11px] text-gray-600 mb-1">
            State <span className="text-gray-400 normal-case">(optional)</span>
          </span>
          <Input
            placeholder="Haryana"
            aria-invalid={Boolean(errors.state)}
            {...register('state', {
              pattern: {
                value: /^[A-Za-z\s\-'.]*$/,
                message: 'State must contain letters and spaces only',
              },
            })}
            // Strip digits + special chars in real time.
            onChange={(e) => {
              const cleaned = e.target.value.replace(/[^A-Za-z\s\-'.]/g, '');
              e.target.value = cleaned;
              void register('state').onChange(e);
            }}
          />
          {errors.state && <p className="text-danger text-xs mt-1">{errors.state.message}</p>}
        </label>
        <label className="block">
          <span className="block font-subhead uppercase tracking-subhead text-[11px] text-gray-600 mb-1">
            Address <span className="text-gray-400 normal-case">(optional)</span>
          </span>
          <Input placeholder="Plot 12, Sector 18, Gurgaon" {...register('address')} />
        </label>
        <label className="block">
          <span className="block font-subhead uppercase tracking-subhead text-[11px] text-gray-600 mb-1">
            Torque Dealer ID <span className="text-gray-400 normal-case">(optional)</span>
          </span>
          <Input placeholder="TQ-DEALER-0001" {...register('torqueDealerId')} />
        </label>
        {error && <div className="text-danger text-sm">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          {/* BUG-029: button always enabled; handleSubmit blocks the API
              call and surfaces inline errors when validation fails.
              Disabling on !isValid before submit hides the form is
              invalid from the admin — let them try + see the errors. */}
          <Button type="submit" disabled={create.isPending || (isSubmitted && !isValid)}>
            {create.isPending ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}


function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
      <div className="bg-hd-white text-text-on-light max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-headline text-2xl tracking-headline">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-text-on-light">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 text-left text-[10px] font-subhead uppercase tracking-subhead text-gray-500 ${className}`}>
      {children}
    </th>
  );
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}
function StatusBadge({ status }: { status: DealerRow['status'] }) {
  const tone = status === 'ACTIVE' ? 'success' : status === 'SUSPENDED' ? 'danger' : 'warning';
  return (
    <Badge variant="status" tone={tone}>
      {status}
    </Badge>
  );
}

// Inline icons — matches the pattern in MyListingsPage / ListingsPage.
const ICON_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: 'w-4 h-4',
  'aria-hidden': true,
};
function PowerIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
      <line x1="12" y1="2" x2="12" y2="12" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}
function BanIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  );
}
function KeyIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}
