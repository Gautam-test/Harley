import { useAuthStore } from '../store/auth';

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  return (
    <div className="px-8 py-10">
      <h1 className="font-headline text-3xl tracking-headline uppercase text-text-on-light">
        Settings
      </h1>
      <p className="text-gray-600 text-sm mt-2">Account details and dealer profile.</p>

      <div className="bg-hd-white border border-gray-200 rounded-card mt-6 max-w-xl divide-y divide-gray-200">
        <Row label="Display Name" value={user?.name ?? '—'} />
        <Row label="Role" value="Dealer Principal" />
        <Row label="User ID" value={user?.id ?? '—'} mono />
      </div>

      <p className="text-xs text-gray-500 mt-6">
        Profile editing, password change and notification preferences are coming soon. Contact H-D Admin
        to update these for now.
      </p>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <span className="font-subhead uppercase tracking-subhead text-[11px] text-gray-500">
        {label}
      </span>
      <span className={`text-sm text-text-on-light ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </span>
    </div>
  );
}
