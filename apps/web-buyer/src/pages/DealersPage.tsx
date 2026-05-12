import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@hd-cpo/ui';
import { api } from '../lib/api';
import { HERO, PageHero } from '../components/PageHero';

interface DealerLocation {
  id: string;
  name: string;
  city: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
}

// Simple, complete view of every active dealer — the destination for the
// "View All Dealers" CTA on the home-page locator. The locator only shows the
// nearest few; this page is the full list with a name/city filter.
export function DealersPage() {
  const [q, setQ] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['public-dealers-all'],
    queryFn: () => api<DealerLocation[]>('/dealers?lat=20.5937&lng=78.9629&radius=5000'),
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return data;
    return data.filter(
      (d) =>
        d.name.toLowerCase().includes(needle) ||
        d.city.toLowerCase().includes(needle) ||
        d.pincode.includes(needle),
    );
  }, [data, q]);

  return (
    <>
      <PageHero
        title="Authorised"
        emphasis="Dealers"
        subtitle="Every H-D Certified motorcycle is sold through one of these authorised dealers."
        image={HERO.lowRider}
      />
      <div className="max-w-container mx-auto px-6 py-10 md:py-12">
        <header className="flex flex-wrap items-baseline justify-end gap-4 mb-8">
          <Input
            placeholder="Filter by name, city or pincode"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-72"
            aria-label="Filter dealers"
          />
        </header>

      {isLoading && <p className="text-gray-500">Loading dealers…</p>}
      {!isLoading && filtered.length === 0 && (
        <p className="text-gray-500">No dealers match that filter.</p>
      )}

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((d) => {
          const websiteUrl = `https://www.google.com/search?q=${encodeURIComponent(
            `${d.name} ${d.city} Harley-Davidson`,
          )}`;
          const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(
            `${d.name} ${d.city}`,
          )}`;
          return (
            <li
              key={d.id}
              className="bg-hd-white border border-gray-200 p-5 rounded-card shadow-sm hover:border-hd-orange transition"
            >
              <div className="font-subhead text-text-on-light text-lg">{d.name}</div>
              <div className="text-sm text-gray-600 mt-1">
                {d.city} · {d.pincode}
              </div>
              <div className="mt-4 flex flex-wrap gap-3 text-xs">
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-hd-orange hover:underline font-subhead uppercase tracking-subhead"
                >
                  Map ↗
                </a>
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-hd-orange hover:underline font-subhead uppercase tracking-subhead"
                >
                  Website ↗
                </a>
              </div>
            </li>
          );
        })}
      </ul>
      </div>
    </>
  );
}
