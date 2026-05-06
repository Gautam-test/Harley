import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input } from '@hd-cpo/ui';
import { api } from '../lib/api';

interface ContentEntry {
  id: string;
  key: string;
  title: string;
  bodyHtml: string;
  version: number;
  updatedAt: string;
}

const STANDARD_KEYS = ['about', 'privacy', 'terms', 'faq', 'contact'];

// Lightweight HTML editor — a real TipTap editor lands in Sprint 5 polish.
// For now: textarea with monospace font; HTML is sanitised on render via DOMPurify
// on the buyer side (PRD §9.3).
export function ContentPage() {
  const qc = useQueryClient();
  const [activeKey, setActiveKey] = useState<string>('about');
  const [title, setTitle] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  // Tracks whether the current local edits diverge from the loaded
  // server copy. Used both to gate the "Save" button visual state and
  // to prompt before discarding on tab change.
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const { data: list } = useQuery({
    queryKey: ['admin-content'],
    queryFn: () => api<ContentEntry[]>('/admin/content'),
  });

  const { data: current } = useQuery({
    queryKey: ['admin-content', activeKey],
    queryFn: () => api<ContentEntry | null>(`/admin/content/${activeKey}`).catch(() => null),
  });

  useEffect(() => {
    setTitle(current?.title ?? '');
    setBodyHtml(current?.bodyHtml ?? '');
    setSavedAt(null);
  }, [current]);

  // Compare against the loaded server copy (not the empty initial state)
  // so an admin landing on a page they haven't touched isn't blocked
  // from clicking another tab.
  const isDirty =
    (current ? title !== current.title || bodyHtml !== current.bodyHtml : Boolean(title) || Boolean(bodyHtml));

  // Tab-switch with confirm — switching away with unsaved edits silently
  // wipes the textarea, which is the worst class of admin-tool bug.
  const switchTo = (k: string) => {
    if (k === activeKey) return;
    if (isDirty && !window.confirm('Discard unsaved changes on this page?')) return;
    setActiveKey(k);
  };

  // beforeunload prompt — backstop for tab close / refresh / cmd-W.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const save = useMutation({
    mutationFn: () =>
      api(`/admin/content/${activeKey}`, {
        method: 'PUT',
        body: JSON.stringify({ title, bodyHtml }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-content'] });
      setSavedAt(new Date());
    },
  });

  const allKeys = [
    ...STANDARD_KEYS,
    ...(list?.filter((c) => !STANDARD_KEYS.includes(c.key)).map((c) => c.key) ?? []),
  ];

  return (
    <div className="max-w-container mx-auto px-4 sm:px-6 py-6 sm:py-10 grid lg:grid-cols-[200px_1fr] gap-6">
      <aside>
        <h2 className="font-subhead uppercase tracking-subhead text-text-on-light mb-3">Pages</h2>
        <ul className="space-y-1">
          {allKeys.map((k) => (
            <li key={k}>
              <button
                type="button"
                onClick={() => switchTo(k)}
                className={`w-full text-left px-3 py-2 text-sm font-subhead uppercase tracking-subhead transition flex items-center justify-between gap-2 ${
                  activeKey === k
                    ? 'bg-hd-black text-hd-orange'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span>{k}</span>
                {activeKey === k && isDirty && (
                  <span
                    aria-label="unsaved changes"
                    title="Unsaved changes"
                    className="w-2 h-2 rounded-full bg-warning shrink-0"
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="bg-hd-white border border-gray-200 p-6">
        <div className="flex items-baseline justify-between mb-4">
          <h1 className="font-headline text-2xl tracking-headline text-text-on-light">
            {activeKey}
          </h1>
          {current && (
            <span className="text-xs text-gray-500">
              v{current.version} · updated {new Date(current.updatedAt).toLocaleString('en-IN')}
            </span>
          )}
        </div>
        <Input
          placeholder="Page title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mb-3"
        />
        <textarea
          rows={20}
          value={bodyHtml}
          onChange={(e) => setBodyHtml(e.target.value)}
          placeholder="<p>HTML content…</p>"
          className="w-full bg-hd-white border border-gray-200 px-4 py-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-hd-orange"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <p className="text-xs text-gray-500 max-w-md">
            HTML is sanitised on the buyer site before render (DOMPurify). TipTap rich-text editor in Sprint 5.
          </p>
          <div className="flex items-center gap-3">
            {/* Live save status pill — fades the previous "saved" state
                back to "unsaved changes" the moment the admin types
                again, so they never click Save twice on the same edit. */}
            {savedAt && !isDirty && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-subhead uppercase tracking-subhead text-success">
                <span aria-hidden>✓</span>
                Saved · v{(current?.version ?? 0) + 1}
              </span>
            )}
            {isDirty && !save.isPending && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-subhead uppercase tracking-subhead text-warning">
                <span className="w-1.5 h-1.5 rounded-full bg-warning" aria-hidden />
                Unsaved changes
              </span>
            )}
            <Button
              onClick={() => save.mutate()}
              disabled={!title || !bodyHtml || save.isPending || !isDirty}
            >
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
