import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Select } from '@hd-cpo/ui';
import { api } from '../lib/api';
import { SearchFilters } from '../components/SearchFilters';
import { HERO, PageHero } from '../components/PageHero';
import {
  ListingCardItem,
  ListingCardSkeleton,
  type ListingCardData,
} from '../components/ListingCard';

interface SearchResponse {
  results: ListingCardData[];
  total: number;
  page: number;
  pageSize: number;
  // pincodeMatch tells us whether the radius filter ran against the exact
  // 3-digit prefix centroid ('exact'), the broader 1-digit region centroid
  // ('region' — approximate), or didn't run ('invalid' = unmapped pincode,
  // null = no pincode/distance pair was supplied).
  meta?: {
    pincodeMatch: 'exact' | 'region' | 'invalid' | null;
  };
}

const PAGE_SIZE = 12;

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'priceAsc', label: 'Price: low → high' },
  { value: 'priceDesc', label: 'Price: high → low' },
  { value: 'kmsAsc', label: 'Lowest KMs' },
];

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const queryString = params.toString();
  const currentPage = Number(params.get('page') ?? '1');
  const sort = params.get('sort') ?? 'newest';

  // Surface a "Filters" floating button once the user has scrolled past the
  // filter column — pressing it scrolls them back to it. Avoids the cramped
  // inner-scroll sidebar UX while keeping filters reachable on long pages.
  const [showFiltersFab, setShowFiltersFab] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const aside = document.getElementById('search-filters');
      if (!aside) return;
      const rect = aside.getBoundingClientRect();
      setShowFiltersFab(rect.bottom < 80);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['listings', queryString],
    queryFn: () => api<SearchResponse>(`/listings?${queryString}`),
    placeholderData: keepPreviousData,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const setParam = (key: string, value: string) => {
    const np = new URLSearchParams(params);
    if (value) np.set(key, value);
    else np.delete(key);
    np.delete('page');
    setParams(np);
  };

  const goToPage = (next: number) => {
    const np = new URLSearchParams(params);
    if (next <= 1) np.delete('page');
    else np.set('page', String(next));
    setParams(np);
  };

  return (
    <>
      <Helmet>
        <title>Search Stock — H-D Certified</title>
        <meta name="description" content="Search Certified Pre-Owned Harley-Davidson motorcycles from authorised Indian dealers." />
      </Helmet>

      <PageHero
        title="Search"
        emphasis="Stock"
        subtitle="Every H-D Certified™ motorcycle is inspected, verified, and backed by an authorized Harley-Davidson dealer."
        image={HERO.searchStock}
        size="lg"
      />

      <div className="bg-surface-light text-text-on-light min-h-screen">
        <div className="max-w-container mx-auto px-6 py-10 grid lg:grid-cols-[300px_1fr] gap-6">
          {/* Filter column scrolls with the page — natural reading order,
              no nested scrollbar. A "Filters" floating button (below) brings
              the user back to the top of this column when they've scrolled
              past it on long result pages. */}
          <aside id="search-filters" className="h-fit">
            <p className="font-subhead uppercase tracking-subhead text-xs text-text-on-light mb-3">
              Search By:
            </p>
            <SearchFilters />
          </aside>

          <section>
            <div className="flex items-baseline justify-between mb-2 flex-wrap gap-3">
              <h2 className="font-subhead text-2xl md:text-3xl text-text-on-light">
                H-D Certified Used Motorcycle Stocklist
              </h2>
              <div className="flex items-center gap-3">
                <span className="font-subhead uppercase tracking-subhead text-[10px] text-gray-500">
                  Sort By
                </span>
                <Select
                  value={sort}
                  onChange={(e) => setParam('sort', e.target.value === 'newest' ? '' : e.target.value)}
                  className="w-44"
                >
                  {SORT_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Please use the filters on the left to refine the H-D Certified CPO stock and find your
              next Harley-Davidson.
            </p>

            {isError && (
              <div className="text-danger bg-danger/10 border border-danger px-4 py-3 rounded-card">
                Could not load listings. Please try again.
              </div>
            )}

            {/* Approximate-results notice — shown when the buyer's pincode
                fell back to the regional centroid because we don't have
                exact data for that 3-digit prefix. The radius filter still
                ran, just from a regional metro rather than the precise
                area, so the buyer sees nearby Certified stock instead of
                the silent "filter did nothing" they used to get. */}
            {data?.meta?.pincodeMatch === 'region' && (
              <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-900 text-[13px] rounded-card">
                We don&apos;t have precise location data for pincode {params.get('pincode')} — showing
                Certified stock within {params.get('distance')} km of the nearest region centroid.
              </div>
            )}

            {isLoading ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <ListingCardSkeleton key={i} />
                ))}
              </div>
            ) : data?.results.length === 0 ? (
              <div className="bg-hd-white border border-gray-200 p-10 text-center rounded-card">
                <p className="font-subhead text-lg text-text-on-light">
                  No motorcycles match your search.
                </p>
                <p className="text-sm text-gray-600 mt-2">Try widening the radius or clearing filters.</p>
                <button
                  type="button"
                  onClick={() => setParams({})}
                  className="mt-5 inline-flex items-center gap-2 bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead text-[11px] px-5 py-2.5 rounded-card hover:brightness-110 transition"
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {data?.results.map((l) => (
                  <ListingCardItem key={l.id} listing={l} />
                ))}
              </div>
            )}

            {data && totalPages > 1 && (
              <Pagination
                page={currentPage}
                total={totalPages}
                goTo={goToPage}
              />
            )}
          </section>
        </div>
      </div>

      {/* Floating "Back to filters" button — appears only when filters are
          off-screen above. Common pattern in e-commerce search; avoids the
          jankiness of nested scrollbars. */}
      {showFiltersFab && (
        <button
          type="button"
          onClick={() => {
            const el = document.getElementById('search-filters');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          aria-label="Back to filters"
          className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead text-[11px] px-4 py-3 rounded-full shadow-2xl hover:brightness-110 transition"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="7" y1="12" x2="17" y2="12" />
            <line x1="10" y1="18" x2="14" y2="18" />
          </svg>
          <span>Filters</span>
        </button>
      )}
    </>
  );
}

function Pagination({
  page,
  total,
  goTo,
}: {
  page: number;
  total: number;
  goTo: (n: number) => void;
}) {
  const [jump, setJump] = useState('');
  const cls = (active: boolean) =>
    `min-w-[2.25rem] h-9 px-3 inline-flex items-center justify-center font-subhead uppercase tracking-subhead text-[11px] rounded-card transition ${
      active
        ? 'bg-hd-orange text-hd-black'
        : 'bg-hd-white text-text-on-light border border-gray-300 hover:border-hd-orange'
    }`;
  // Render at most 3 numeric pages around the current.
  const start = Math.max(1, Math.min(page, total - 2));
  const numbers: number[] = [];
  for (let i = 0; i < 3 && start + i <= total; i++) numbers.push(start + i);

  const onJump = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(jump);
    if (Number.isFinite(n) && n >= 1 && n <= total) goTo(n);
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 mt-10">
      <button type="button" className={cls(false)} onClick={() => goTo(1)} disabled={page === 1}>
        First
      </button>
      {numbers.map((n) => (
        <button key={n} type="button" className={cls(n === page)} onClick={() => goTo(n)}>
          {n}
        </button>
      ))}
      <button type="button" className={cls(false)} onClick={() => goTo(total)} disabled={page === total}>
        Last
      </button>
      <form onSubmit={onJump} className="flex items-center gap-2 ml-2">
        <span className="font-subhead uppercase tracking-subhead text-[10px] text-gray-500">
          Jump to Page:
        </span>
        <input
          type="number"
          min={1}
          max={total}
          value={jump}
          onChange={(e) => setJump(e.target.value)}
          placeholder={String(page)}
          className="w-16 h-9 border border-gray-300 rounded-card px-2 text-sm text-center"
        />
      </form>
    </div>
  );
}
