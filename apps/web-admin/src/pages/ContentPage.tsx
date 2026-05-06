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
  }, [current]);

  const save = useMutation({
    mutationFn: () =>
      api(`/admin/content/${activeKey}`, {
        method: 'PUT',
        body: JSON.stringify({ title, bodyHtml }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-content'] });
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
                onClick={() => setActiveKey(k)}
                className={`w-full text-left px-3 py-2 text-sm font-subhead uppercase tracking-subhead transition ${
                  activeKey === k
                    ? 'bg-hd-black text-hd-orange'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {k}
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
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-500">
            HTML is sanitised on the buyer site before render (DOMPurify). TipTap rich-text editor in Sprint 5.
          </p>
          <Button onClick={() => save.mutate()} disabled={!title || !bodyHtml || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </section>
    </div>
  );
}
