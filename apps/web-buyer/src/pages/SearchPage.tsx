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
// EMI Calculator was previously mounted at this layer; it now lives
// inside SearchFilters per the Figma sidebar hierarchy.

interface SearchResponse {
  results: ListingCardData[];
  total: number;
  page: number;
  pageSize: number;
  // Set when the buyer's pincode had no exact-match dealer and the API
  // fell back to the distance filter. We render a short notice above
  // the grid telling the buyer their exact pincode had no stock and
  // these are the nearest results.
  meta?: {
    pincodeFallback?: {
      searchedPincode: string;
      nearestPincode: string;
    };
  };
}

const PAGE_SIZE = 9;

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

  // QA BUG-023: filters must NOT persist across a page refresh — buyers
  // expect a clean stocklist when they reload. Detect the navigation
  // type via the Performance Timeline API: if this page load came from
  // a browser reload (F5 / Ctrl-R / pull-to-refresh), strip every
  // query param so the URL bar AND form state reset to default.
  // Plain navigation (link click, header search submit, back/forward)
  // keeps its params, so deep-links + sharable URLs still work.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nav = window.performance?.getEntriesByType?.('navigation')?.[0] as
      | PerformanceNavigationTiming
      | undefined;
    const isReload =
      nav?.type === 'reload' ||
      // Legacy fallback for browsers that don't yet expose the
      // PerformanceNavigationTiming.type field.
      (typeof performance !== 'undefined' &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (performance as any).navigation?.type === 1);
    if (isReload && window.location.search) {
      setParams(new URLSearchParams(), { replace: true });
    }
    // Intentionally one-shot on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mobile slide-over drawer state. Below lg the sidebar is hidden from
  // the inline layout and lives in this drawer instead so phone/tablet
  // users can still filter.
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  useEffect(() => {
    // Close drawer if viewport grows past lg (phone rotates to tablet,
    // mobile-to-desktop window resize, etc.).
    const onResize = () => {
      if (window.innerWidth >= 1024) setMobileFiltersOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
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
        subtitle="Every H-D Certified™ Motorcycle Is Inspected, Verified, And Backed By An Authorized Harley-Davidson® Dealer."
        image={HERO.searchStock}
        size="lg"
      />

      {/* QA latest: Search Stock body fill = #FFFFFF (was the soft grey
          surface-light). The grey now only appears inside the sidebar
          panel above the EMI Calculator; the main results column reads
          as a clean white canvas per Figma. */}
      <div className="bg-hd-white text-text-on-light min-h-screen">
        {/* Mobile "Filters" trigger — visible only below lg where the
            sidebar collapses out of the layout. Tapping opens the
            slide-over drawer below. */}
        <div className="lg:hidden max-w-container mx-auto px-4 sm:px-6 pt-4">
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(true)}
            className="w-full inline-flex items-center justify-center gap-2 bg-hd-black text-hd-white font-subhead font-bold uppercase tracking-subhead text-xs px-4 py-3 hover:brightness-110 transition"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="7" y1="12" x2="17" y2="12" />
              <line x1="10" y1="18" x2="14" y2="18" />
            </svg>
            Filters
          </button>
        </div>

        <div className="max-w-container mx-auto px-4 sm:px-6 py-6 sm:py-10 grid lg:grid-cols-[300px_1fr] gap-6">
          {/* Desktop sidebar — hidden below lg. Mobile users get the
              full-screen slide-over drawer rendered after this div. */}
          <aside id="search-filters" className="hidden lg:block h-fit">
            <SearchFilters />
          </aside>

          <section>
            {/* BUG_UI_009 #1: heading restored to the Figma form with the
                ™ symbol and rendered in font-subhead (1903 Sans, wider
                cut) at a bumped size. font-headline (Condensed) was
                visually compressing the row. */}
            <div className="flex items-baseline justify-between mb-4 flex-wrap gap-3">
              {/* QA latest: heading locked to exactly 24px per spec
                  (was scaling up to 28px on lg). */}
              <h2 className="font-subhead font-bold tracking-subhead uppercase text-[24px] text-text-on-light leading-tight">
                H-D Certified&trade; Used Motorcycle Stocklist
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

            {/* QA RE-OPEN (Search Stock Figma): paragraph sits BETWEEN
                the heading-row and the CertTabs per the design — was
                previously rendered AFTER the tabs which inverted the
                Figma rhythm. */}
            <p className="text-sm text-gray-600 mb-5">
              Please use the filters on the left to refine the H-D Certified (CPO) stock and find your
              next Harley-Davidson.
            </p>

            {/* Top filter tab row — three buttons that map to the same
                `cert` URL param. */}
            <CertTabs
              active={(params.get('cert') as '' | 'CPO' | 'AS_IS') ?? ''}
              onChange={(v) => setParam('cert', v)}
            />

            {isError && (
              <div className="text-danger bg-danger/10 border border-danger px-4 py-3 rounded-card">
                Could not load listings. Please try again.
              </div>
            )}

            {/* Pincode-fallback notice — surfaced when the buyer typed a
                pincode that has no exact-match dealer with stock, and we
                fell back to the distance filter. Tells them precisely
                which pincode the displayed bikes are from so the
                proximity is obvious (e.g. "no bikes for 122004 — showing
                nearest from 122001"). */}
            {data?.meta?.pincodeFallback && (
              <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-900 text-[13px] rounded-card">
                No motorcycles available for pincode{' '}
                <strong>{data.meta.pincodeFallback.searchedPincode}</strong> — showing nearest
                results from pincode <strong>{data.meta.pincodeFallback.nearestPincode}</strong>.
              </div>
            )}

            {isLoading ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <ListingCardSkeleton key={i} />
                ))}
              </div>
            ) : data?.results.length === 0 ? (
              // Empty-state — covers every "nothing to show" case with a
              // single clear message:
              //   - pincode supplied + dealers exist near it but no stock
              //   - pincode supplied + no dealers in range
              //   - pincode supplied + pincode unmappable
              //   - other filter combos that produced zero results
              // When a pincode IS in the URL we lead with the pincode-
              // specific copy so the buyer immediately sees why the grid
              // is empty; otherwise we keep the original generic message.
              <div className="bg-hd-white border border-gray-200 p-10 text-center rounded-card">
                <p className="font-subhead text-lg text-text-on-light">
                  {params.get('pincode')
                    ? `No motorcycles available for pincode ${params.get('pincode')}.`
                    : 'No motorcycles match your search.'}
                </p>
                <p className="text-sm text-gray-600 mt-2">
                  {params.get('pincode')
                    ? 'Try a different pincode, widen the distance, or clear the filter to see all stock.'
                    : 'Try widening the radius or clearing filters.'}
                </p>
                <button
                  type="button"
                  onClick={() => setParams({})}
                  className="mt-5 inline-flex items-center gap-2 bg-hd-orange text-hd-white font-subhead uppercase tracking-subhead text-[11px] px-5 py-2.5 rounded-card hover:brightness-110 transition"
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

      {/* Mobile filter drawer — full-height slide-over from the left.
          Hosts the SearchFilters component (same instance you'd see on
          desktop). Closes on backdrop tap, on the inner ✕, and on every
          successful URL filter change (auto-apply triggers setParams →
          we close here so the buyer sees the updated grid). */}
      {mobileFiltersOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setMobileFiltersOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Search filters"
            className="relative bg-surface-light w-[88%] max-w-sm h-full overflow-y-auto shadow-2xl"
          >
            <div className="sticky top-0 z-10 bg-hd-black text-hd-white px-4 py-3 flex items-center justify-between">
              <span className="font-subhead font-bold uppercase tracking-subhead text-sm">
                Filters
              </span>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                aria-label="Close"
                className="text-hd-white hover:text-hd-orange"
              >
                ✕
              </button>
            </div>
            <div className="p-3">
              <SearchFilters />
            </div>
          </aside>
        </div>
      )}

    </>
  );
}

// EmiCalculatorPanel moved into SearchFilters during the BUG re-open
// pass — the Figma reference places it inside the sidebar hierarchy
// beneath the Apply Filters CTA, not as a standalone sibling component
// on the page.

// BUG_UI_009 #4: top filter tabs above the grid. Drives the same `cert`
// URL param the sidebar radio uses, so the two stay in sync no matter
// which surface the buyer touches. Labels match the Figma exactly.
function CertTabs({
  active,
  onChange,
}: {
  active: '' | 'CPO' | 'AS_IS';
  onChange: (v: string) => void;
}) {
  const tabs: { id: '' | 'CPO' | 'AS_IS'; label: string }[] = [
    { id: '', label: 'All Pre-Owned Motorcycles' },
    { id: 'CPO', label: 'Certified Pre-Owned' },
    // Client feedback #12: "As-is Motorcycles" → "Pre-Owned Motorcycles"
    { id: 'AS_IS', label: 'Pre-Owned Motorcycles' },
  ];
  return (
    <nav
      className="flex items-end gap-1 mb-6 border-b border-gray-200 overflow-x-auto scrollbar-hide"
      role="tablist"
      aria-label="Filter listings by certification"
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id || 'all'}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className={`px-4 py-2.5 text-sm font-subhead font-bold uppercase tracking-subhead border-b-2 -mb-px transition whitespace-nowrap ${
              isActive
                ? 'border-hd-orange text-text-on-light'
                : 'border-transparent text-gray-500 hover:text-text-on-light'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </nav>
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
        ? 'bg-hd-orange text-hd-white'
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
