import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Input } from '@hd-cpo/ui';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth';

interface AuditEntry {
  id: string;
  createdAt: string;
  actorId: string | null;
  actorRole: string;
  actorName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
}

export function AuditPage() {
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const token = useAuthStore.getState().accessToken;

  const { data, isLoading } = useQuery({
    queryKey: ['admin-audit', action, entityType],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (action) sp.set('action', action);
      if (entityType) sp.set('entityType', entityType);
      sp.set('limit', '500');
      return api<AuditEntry[]>(`/admin/audit?${sp.toString()}`);
    },
  });

  const exportCsv = () => {
    const sp = new URLSearchParams();
    if (action) sp.set('action', action);
    if (entityType) sp.set('entityType', entityType);
    sp.set('format', 'csv');
    sp.set('limit', '1000');
    // Direct browser fetch + download.
    fetch(`/api/v1/admin/audit?${sp.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  return (
    <div className="max-w-container mx-auto px-6 py-10">
      <div className="flex items-baseline justify-between flex-wrap gap-4 mb-6">
        <h1 className="font-headline text-3xl tracking-headline text-text-on-light">Audit Log</h1>
        <div className="flex items-center gap-3">
          <Input placeholder="Filter by action" value={action} onChange={(e) => setAction(e.target.value)} className="w-48" />
          <Input placeholder="Filter by entity type" value={entityType} onChange={(e) => setEntityType(e.target.value)} className="w-48" />
          <Button variant="secondary" onClick={exportCsv}>Export CSV</Button>
        </div>
      </div>

      <div className="bg-hd-white border border-gray-200 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <Th>Time</Th>
              <Th>Actor</Th>
              <Th>Action</Th>
              <Th>Entity</Th>
              <Th>IP</Th>
              <Th>Detail</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading && (
              <tr>
                <td colSpan={6} className="text-center py-6 text-gray-500">Loading…</td>
              </tr>
            )}
            {data?.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-10 text-gray-500">No audit entries.</td>
              </tr>
            )}
            {data?.map((e) => (
              <tr key={e.id} className="hover:bg-gray-50 align-top">
                <Td className="text-xs text-gray-600 whitespace-nowrap">
                  {new Date(e.createdAt).toLocaleString('en-IN')}
                </Td>
                <Td>
                  <div className="font-subhead">{e.actorName ?? e.actorRole}</div>
                  <div className="text-xs text-gray-500">{e.actorRole}</div>
                </Td>
                <Td>
                  <Badge variant="status" tone="info">
                    {e.action}
                  </Badge>
                </Td>
                <Td className="text-xs">
                  {e.entityType ?? '—'}
                  {e.entityId && (
                    <div className="text-gray-500 font-mono">{e.entityId.slice(0, 8)}…</div>
                  )}
                </Td>
                <Td className="text-xs font-mono">{e.ipAddress ?? '—'}</Td>
                <Td className="text-xs">
                  {e.metadata ? (
                    <code className="text-gray-600">{JSON.stringify(e.metadata)}</code>
                  ) : (
                    '—'
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-subhead uppercase tracking-subhead text-gray-500">
      {children}
    </th>
  );
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}
