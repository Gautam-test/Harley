import { useQuery } from '@tanstack/react-query';
import { Badge } from '@hd-cpo/ui';
import { api } from '../lib/api';

// View-only profile page for the dealer principal. Pulls the full Dealer
// row via /api/v1/auth/me — no edit affordances per the QA spec ("add all
// necessary data in view format only"). Edits flow through the admin
// panel for now (Settings was retired May 2026).
interface DealerProfile {
  role: 'DEALER';
  id: string;
  username: string;
  name: string;
  legalName: string | null;
  email: string;
  phone: string;
  address: string | null;
  city: string;
  state: string | null;
  pincode: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  torqueDealerId: string | null;
  createdAt: string;
}

export function ProfilePage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dealer-me'],
    queryFn: () => api<DealerProfile>('/auth/me'),
  });

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-10 text-gray-500 text-sm">
        Loading profile…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-10 text-danger text-sm">
        Could not load profile. Try signing out and back in.
      </div>
    );
  }

  const tone =
    data.status === 'ACTIVE'
      ? 'success'
      : data.status === 'SUSPENDED'
      ? 'danger'
      : 'warning';

  return (
    <div className="max-w-container mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="flex items-baseline justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="font-headline text-3xl tracking-headline text-text-on-light">
            Dealer <span className="text-hd-orange">Profile</span>
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Read-only summary of your dealership account. Contact your H-D
            admin to update any of these fields.
          </p>
        </div>
        <Badge variant="status" tone={tone}>
          {data.status}
        </Badge>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Identity card — name + reference IDs at a glance. */}
        <section className="bg-hd-white border border-gray-200 p-6 lg:col-span-2">
          <h2 className="font-subhead uppercase tracking-subhead text-sm text-text-on-light">
            Identity
          </h2>
          <dl className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <Row label="Dealership Name" value={data.name} />
            <Row label="Legal Name" value={data.legalName ?? '—'} />
            <Row label="Username" value={data.username} mono />
            <Row label="Member Since" value={fmtDate(data.createdAt)} />
            <Row
              label="Torque Dealer ID"
              value={data.torqueDealerId ?? '— (not linked yet)'}
              mono
            />
            <Row label="Account ID" value={data.id} mono small />
          </dl>
        </section>

        {/* Contact card — phone + email + address. The dealer's own
            communication channels, surfaced to the admin queue when a
            buyer enquiry routes here. */}
        <section className="bg-hd-white border border-gray-200 p-6">
          <h2 className="font-subhead uppercase tracking-subhead text-sm text-text-on-light">
            Contact
          </h2>
          <dl className="mt-4 space-y-4 text-sm">
            <Row label="Phone" value={data.phone} mono />
            {/* QA BUG-007: previously bound to `data.email`, which is a
                separate display field seeded with a placeholder (e.g.
                sales@bengaluru-hd.example.in). The dealer's actual
                registered email is their login `username` — surface that
                so the Contact card matches the account they signed in
                with. Fall back to data.email only if username somehow
                isn't an email (legacy rows). */}
            <Row
              label="Email"
              value={isLikelyEmail(data.username) ? data.username : data.email}
            />
          </dl>
        </section>

        {/* Address card — full mailing address; mirrors what's on the
            dealer's listings + invoices. */}
        <section className="bg-hd-white border border-gray-200 p-6 lg:col-span-3">
          <h2 className="font-subhead uppercase tracking-subhead text-sm text-text-on-light">
            Address
          </h2>
          <dl className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4 text-sm">
            <Row label="Street" value={data.address ?? '—'} />
            <Row label="City" value={data.city} />
            <Row label="State" value={data.state ?? '—'} />
            <Row label="PIN Code" value={data.pincode} mono />
          </dl>
        </section>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono = false,
  small = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div>
      <dt className="font-subhead uppercase tracking-subhead text-[10px] text-gray-500 mb-1">
        {label}
      </dt>
      <dd
        className={`text-text-on-light ${mono ? 'font-mono' : ''} ${
          small ? 'text-xs' : ''
        } break-words`}
      >
        {value}
      </dd>
    </div>
  );
}

function isLikelyEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}
