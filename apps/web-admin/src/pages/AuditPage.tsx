import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, IconButton, Input } from '@hd-cpo/ui';
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
    const apiBase = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '') + '/api/v1';
    fetch(`${apiBase}/admin/audit?${sp.toString()}`, {
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
    <div className="max-w-container mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="flex items-baseline justify-between flex-wrap gap-4 mb-6">
        <h1 className="font-headline text-3xl tracking-headline text-text-on-light">Audit Log</h1>
        <div className="flex items-center gap-3">
          <Input placeholder="Filter by action" value={action} onChange={(e) => setAction(e.target.value)} className="w-48" />
          <Input placeholder="Filter by entity type" value={entityType} onChange={(e) => setEntityType(e.target.value)} className="w-48" />
          <Button variant="secondary" onClick={exportCsv}>Export CSV</Button>
        </div>
      </div>

      {/* 6 cols → 4. Event cell folds action + entity type; Actor cell folds
          name + role badge; When cell shows date + relative time + IP.
          Detail cell collapses metadata behind an expand toggle so the
          JSON noise doesn't dominate every row. */}
      <div className="bg-hd-white border border-gray-200 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50/80 text-text-on-light">
            <tr>
              <Th>Event</Th>
              <Th>Actor</Th>
              <Th>When</Th>
              <Th className="text-right pr-4">Detail</Th>
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
                  No audit entries match this filter.
                </td>
              </tr>
            )}
            {data?.map((e) => {
              const isExpanded = expandedId === e.id;
              const metadataStr = e.metadata ? JSON.stringify(e.metadata) : '';
              const hasMetadata = metadataStr.length > 0;
              return (
                <ExpandableRow
                  key={e.id}
                  entry={e}
                  isExpanded={isExpanded}
                  metadataStr={metadataStr}
                  hasMetadata={hasMetadata}
                  onToggle={() => setExpandedId(isExpanded ? null : e.id)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExpandableRow({
  entry,
  isExpanded,
  metadataStr,
  hasMetadata,
  onToggle,
}: {
  entry: AuditEntry;
  isExpanded: boolean;
  metadataStr: string;
  hasMetadata: boolean;
  onToggle: () => void;
}) {
  const date = new Date(entry.createdAt);
  return (
    <>
      <tr className="hover:bg-hd-orange/5 transition-colors align-top">
        <Td>
          <div className="font-subhead uppercase tracking-subhead text-[13px] text-text-on-light leading-tight">
            {entry.action}
          </div>
          {entry.entityType && (
            <div className="text-[11px] text-gray-500 mt-0.5 leading-tight">
              {entry.entityType}
              {entry.entityId && (
                <span className="font-mono text-gray-400 ml-1">
                  ·{entry.entityId.slice(0, 8)}
                </span>
              )}
            </div>
          )}
        </Td>
        <Td>
          <div className="text-[13px] text-text-on-light leading-tight">
            {entry.actorName ?? '—'}
          </div>
          <div className="mt-1">
            <RoleBadge role={entry.actorRole} />
          </div>
        </Td>
        <Td>
          <div className="text-[11px] text-text-on-light whitespace-nowrap">
            {date.toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5 whitespace-nowrap">
            {date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            {' · '}
            {relativeTime(date)}
          </div>
          {entry.ipAddress && (
            <div className="font-mono text-[10px] text-gray-400 mt-0.5 whitespace-nowrap">
              {entry.ipAddress}
            </div>
          )}
        </Td>
        <Td className="text-right pr-4">
          <div className="inline-flex items-center justify-end gap-1.5">
            {hasMetadata ? (
              <>
                <span
                  className="font-mono text-[10px] text-gray-500 truncate max-w-[180px] inline-block align-middle"
                  title={metadataStr}
                >
                  {metadataStr}
                </span>
                <IconButton
                  label={isExpanded ? 'Collapse' : 'Expand'}
                  onClick={onToggle}
                >
                  {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                </IconButton>
              </>
            ) : (
              <span className="text-[11px] text-gray-400">—</span>
            )}
          </div>
        </Td>
      </tr>
      {isExpanded && hasMetadata && (
        <tr className="bg-gray-50/40">
          <td colSpan={4} className="px-4 py-3">
            <pre className="font-mono text-[11px] text-gray-700 whitespace-pre-wrap break-words bg-hd-white border border-gray-200 rounded p-3 leading-relaxed">
              {safePrettyJson(metadataStr)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

// Pretty-print metadata JSON when possible; fall back to the raw string for
// anything that won't reparse (shouldn't happen since we stringified it
// ourselves, but defensive).
function safePrettyJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

// Compact relative-time helper — "5m ago", "3h ago", "2d ago". Used as a
// secondary cue alongside the absolute date in the When cell.
function relativeTime(d: Date): string {
  const diff = Date.now() - d.getTime();
  const sec = Math.max(1, Math.round(diff / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
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

function RoleBadge({ role }: { role: string }) {
  const tone =
    role === 'ADMIN' || role === 'admin'
      ? 'info'
      : role === 'DEALER' || role === 'dealer'
      ? 'warning'
      : 'neutral';
  return (
    <Badge variant="status" tone={tone}>
      {role}
    </Badge>
  );
}

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
function ChevronDownIcon() {
  return (
    <svg {...ICON_PROPS}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
function ChevronUpIcon() {
  return (
    <svg {...ICON_PROPS}>
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}
