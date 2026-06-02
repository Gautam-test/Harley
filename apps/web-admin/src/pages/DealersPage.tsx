import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Input, Select } from '@hd-cpo/ui';
import { api, ApiError } from '../lib/api';

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
  const [showImport, setShowImport] = useState(false);
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
          <Button onClick={() => setShowImport(true)} variant="secondary">
            Bulk Import
          </Button>
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

      <div className="bg-hd-white border border-gray-200 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <Th>Name</Th>
              <Th>Username</Th>
              <Th>City</Th>
              <Th>Email</Th>
              <Th>Phone</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading && (
              <tr>
                <td colSpan={7} className="text-center py-6 text-gray-500">Loading…</td>
              </tr>
            )}
            {data?.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-gray-500">No dealers match.</td>
              </tr>
            )}
            {data?.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50">
                <Td className="font-subhead">{d.name}</Td>
                <Td className="font-mono text-xs">{d.username}</Td>
                <Td>{d.city}</Td>
                <Td className="text-xs">{d.email}</Td>
                <Td className="font-mono text-xs">{d.phone}</Td>
                <Td>
                  <StatusBadge status={d.status} />
                </Td>
                <Td className="text-right space-x-2 whitespace-nowrap">
                  {/* Three transitions are valid: ACTIVE | INACTIVE | SUSPENDED.
                      Each button only renders when the dealer isn't already in
                      that state, so the row never shows a no-op button. The
                      Inactive action was missing entirely (QA blocker — admins
                      had no way to soft-disable a dealer without a full Suspend). */}
                  {d.status !== 'ACTIVE' && (
                    <Button
                      size="sm"
                      onClick={() => setStatus.mutate({ id: d.id, status: 'ACTIVE' })}
                    >
                      Activate
                    </Button>
                  )}
                  {d.status !== 'INACTIVE' && (
                    <Button
                      size="sm"
                      variant="secondary"
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
                      Set Inactive
                    </Button>
                  )}
                  {d.status !== 'SUSPENDED' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setStatus.mutate({ id: d.id, status: 'SUSPENDED' })}
                    >
                      Suspend
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => resetPwd.mutate(d.id)}
                  >
                    Reset PW
                  </Button>
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
      {showImport && (
        <BulkImportModal
          onClose={() => setShowImport(false)}
          onDone={() => qc.invalidateQueries({ queryKey: ['admin-dealers'] })}
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
  const { register, handleSubmit, watch, setValue, getValues, formState: { errors, isValid, isSubmitted }, setError: setFieldError } = useForm<{
    username: string;
    name: string;
    email: string;
    phone: string;
    city: string;
    pincode: string;
    state?: string;
    address?: string;
    torqueDealerId?: string;
  }>({ mode: 'onTouched' });
  const [error, setError] = useState<string | null>(null);
  const [pincodeLookup, setPincodeLookup] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

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
        onSubmit={handleSubmit((v) => create.mutate(v))}
        className="space-y-4"
      >
        <label className="block">
          <span className="block font-subhead uppercase tracking-subhead text-[11px] text-gray-600 mb-1">
            Username <span className="text-danger">*</span>
          </span>
          <Input
            placeholder="lowercase, no spaces"
            {...register('username', {
              required: 'Username is required',
              pattern: { value: /^[a-z0-9_-]+$/, message: 'Lowercase letters, numbers, hyphens only' },
            })}
          />
          {errors.username && <p className="text-danger text-xs mt-1">{errors.username.message}</p>}
        </label>
        <label className="block">
          <span className="block font-subhead uppercase tracking-subhead text-[11px] text-gray-600 mb-1">
            Dealer Name <span className="text-danger">*</span>
          </span>
          <Input
            placeholder="e.g. Capital Harley-Davidson Gurgaon"
            {...register('name', { required: 'Dealer name is required' })}
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
            {...register('email', {
              required: 'Email is required',
              pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email' },
            })}
          />
          {errors.email && <p className="text-danger text-xs mt-1">{errors.email.message}</p>}
        </label>
        <label className="block">
          <span className="block font-subhead uppercase tracking-subhead text-[11px] text-gray-600 mb-1">
            Phone <span className="text-danger">*</span>
          </span>
          <Input
            placeholder="+91XXXXXXXXXX"
            {...register('phone', {
              required: 'Phone is required',
              pattern: { value: /^\+91[0-9]{10}$/, message: 'Format: +91XXXXXXXXXX' },
            })}
          />
          {errors.phone && <p className="text-danger text-xs mt-1">{errors.phone.message}</p>}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block font-subhead uppercase tracking-subhead text-[11px] text-gray-600 mb-1">
              City <span className="text-danger">*</span>
            </span>
            <Input
              placeholder="Gurgaon"
              {...register('city', { required: 'City is required' })}
            />
            {errors.city && <p className="text-danger text-xs mt-1">{errors.city.message}</p>}
          </label>
          <label className="block">
            <span className="block font-subhead uppercase tracking-subhead text-[11px] text-gray-600 mb-1">
              Pincode <span className="text-danger">*</span>
            </span>
            <Input
              placeholder="122001"
              maxLength={6}
              {...register('pincode', {
                required: 'Pincode is required',
                pattern: { value: /^[0-9]{6}$/, message: '6-digit pincode required' },
              })}
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
          <Input placeholder="Haryana" {...register('state')} />
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
          <Button type="submit" disabled={(!isValid && isSubmitted) || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function BulkImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<{
    summary: { total: number; created: number; skipped: number; errors: number };
    results: Array<{
      rowNumber: number;
      username?: string;
      status: 'created' | 'skipped' | 'error';
      error?: string;
      generatedPassword?: string;
    }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Pick a file');
      const fd = new FormData();
      fd.append('file', file);
      return api<{
        summary: { total: number; created: number; skipped: number; errors: number };
        results: Array<{
          rowNumber: number;
          username?: string;
          status: 'created' | 'skipped' | 'error';
          error?: string;
          generatedPassword?: string;
        }>;
      }>('/admin/import/dealers', { method: 'POST', body: fd, formData: true });
    },
    onSuccess: (res) => {
      setResult(res);
      onDone();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Upload failed'),
  });
  return (
    <Modal onClose={onClose} title="Bulk Import Dealers">
      {!result && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Upload a .xlsx with columns: <code>username, password (optional), name, legalName, email, phone, address, city, state, pincode, torqueDealerId</code>.
          </p>
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
          {error && <div className="text-danger text-sm">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={() => upload.mutate()} disabled={!file || upload.isPending}>
              {upload.isPending ? 'Importing…' : 'Import'}
            </Button>
          </div>
        </div>
      )}
      {result && (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-sm">
            <Stat label="Total" value={result.summary.total} />
            <Stat label="Created" value={result.summary.created} good />
            <Stat label="Skipped" value={result.summary.skipped} />
            <Stat label="Errors" value={result.summary.errors} bad={result.summary.errors > 0} />
          </div>
          <div className="border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-2 py-1">Row</th>
                  <th className="text-left px-2 py-1">Username</th>
                  <th className="text-left px-2 py-1">Status</th>
                  <th className="text-left px-2 py-1">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {result.results.map((r, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1">{r.rowNumber}</td>
                    <td className="px-2 py-1 font-mono">{r.username ?? '—'}</td>
                    <td className="px-2 py-1">{r.status}</td>
                    <td className="px-2 py-1">
                      {r.error ?? (r.generatedPassword ? `password: ${r.generatedPassword}` : '')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
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
    <th className={`px-4 py-3 text-left text-xs font-subhead uppercase tracking-subhead text-gray-500 ${className}`}>
      {children}
    </th>
  );
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}
function StatusBadge({ status }: { status: DealerRow['status'] }) {
  const tone = status === 'ACTIVE' ? 'success' : status === 'SUSPENDED' ? 'danger' : 'warning';
  return (
    <Badge variant="status" tone={tone}>
      {status}
    </Badge>
  );
}
function Stat({ label, value, good, bad }: { label: string; value: number; good?: boolean; bad?: boolean }) {
  return (
    <div className={`p-3 border ${good ? 'border-success' : bad ? 'border-danger' : 'border-gray-200'}`}>
      <div className="text-[10px] font-subhead uppercase tracking-subhead text-gray-500">{label}</div>
      <div className="font-headline text-xl">{value}</div>
    </div>
  );
}
