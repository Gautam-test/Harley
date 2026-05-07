import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

// View-only admin profile. The admin user record only carries identity
// fields (name, email, created date) — no contact / address columns —
// so the page is intentionally compact. Edit affordances are deferred
// until an admin-roles spec ships.
interface AdminProfile {
  role: 'ADMIN';
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export function ProfilePage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-me'],
    queryFn: () => api<AdminProfile>('/auth/me'),
  });

  if (isLoading) {
    return (
      <div className="max-w-container mx-auto px-4 sm:px-6 py-6 sm:py-10 text-gray-500 text-sm">
        Loading profile…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="max-w-container mx-auto px-4 sm:px-6 py-6 sm:py-10 text-danger text-sm">
        Could not load profile. Try signing out and back in.
      </div>
    );
  }

  return (
    <div className="max-w-container mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <h1 className="font-headline text-3xl tracking-headline text-text-on-light">
        Admin <span className="text-hd-orange">Profile</span>
      </h1>
      <p className="text-sm text-gray-600 mt-1">
        Read-only summary of your admin account.
      </p>

      <section className="mt-6 max-w-2xl bg-hd-white border border-gray-200 rounded-card p-6">
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <Row label="Full Name" value={data.name} />
          <Row label="Role" value="Administrator" />
          <Row label="Email" value={data.email} />
          <Row label="Member Since" value={fmtDate(data.createdAt)} />
          <Row label="Account ID" value={data.id} mono small />
        </dl>
      </section>
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
