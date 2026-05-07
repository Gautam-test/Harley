import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@hd-cpo/ui';
import { api, ApiError } from '../lib/api';
import { approxEmi } from '../lib/emi';
import { ImageGallery } from '../components/ImageGallery';
import { EmiCalculator } from '../components/EmiCalculator';
import { ListingSidebarCard } from '../components/ListingSidebarCard';
import { BenefitsSection } from '../components/BenefitsSection';
import { DealerLocator } from '../components/DealerLocator';

interface ListingDetail {
  id: string;
  slug: string;
  vin: string;
  modelFamily: string;
  modelName: string;
  year: number;
  colour: string;
  price: number;
  kmsDriven: number;
  description: string;
  images: string[];
  inspectionReportUrl: string | null;
  certificationStatus: 'CPO' | 'AS_IS';
  owners: number | null;
  publishedAt: string | null;
  dealerId: string;
  dealerName: string;
  city: string;
  pincode?: string | null;
  state?: string | null;
}

// "EMI from" hint reuses the shared helper — same defaults as the
// calculator + search-filter slider so all three figures stay in sync.

export function ListingDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['listing', slug],
    queryFn: () => api<ListingDetail>(`/listings/${slug}`),
    retry: (count, err) => {
      if (err instanceof ApiError && err.status === 404) return false;
      return count < 2;
    },
  });

  const [tab, setTab] = useState<'overview' | 'specs'>('overview');

  if (isLoading) return <DetailSkeleton />;
  if (isError && error instanceof ApiError && error.status === 404) return <NotFound />;
  if (!data) return null;

  const heading = `${data.year} ${data.modelName}`;
  const stockCode = data.vin.slice(-5).toUpperCase();
  // Header meta strip — keeps the H1's quick context tight without
  // repeating the labelled spec rows below. Stock Code is its own row in
  // the at-a-glance strip so it's NOT included here.
  const metaLine = [data.year, `${data.kmsDriven.toLocaleString('en-IN')} KM`, data.colour.toUpperCase()].join(' · ');
  const emiFrom = approxEmi(data.price);
  const listedOn = data.publishedAt
    ? new Date(data.publishedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })
    : 'Not Specified';

  // PRD §6.1.3 AC1 — JSON-LD Vehicle schema for SEO.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Vehicle',
    name: heading,
    vehicleIdentificationNumber: data.vin,
    modelDate: data.year,
    color: data.colour,
    mileageFromOdometer: { '@type': 'QuantitativeValue', value: data.kmsDriven, unitCode: 'KMT' },
    offers: {
      '@type': 'Offer',
      price: data.price,
      priceCurrency: 'INR',
      availability: 'https://schema.org/InStock',
      seller: { '@type': 'AutoDealer', name: data.dealerName },
    },
  };

  return (
    <>
      <Helmet>
        <title>{heading} — H-D Certified</title>
        <meta name="description" content={`${heading} — ${data.kmsDriven.toLocaleString('en-IN')} km, ${data.colour}. From ${data.dealerName}, ${data.city}.`} />
        <meta property="og:title" content={heading} />
        <meta property="og:image" content={data.images[0] ?? ''} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <div className="bg-hd-white text-text-on-light">
        <div className="max-w-container mx-auto px-6 py-6">
          <nav className="text-xs text-gray-600 mb-5">
            <Link to="/" className="hover:text-hd-orange">Home</Link>
            <span className="mx-2">›</span>
            <Link to="/search" className="hover:text-hd-orange">Search Stock</Link>
          </nav>

          {/* Top section — gallery left, price/dealer card right */}
          <div className="grid lg:grid-cols-[1fr_360px] gap-8">
            <div>
              <ImageGallery images={data.images} alt={heading} />
            </div>

            <aside>
              <ListingSidebarCard
                slug={data.slug}
                modelInterest={`${data.year} ${data.modelName}`}
                price={data.price}
                emiFrom={emiFrom}
                dealerId={data.dealerId}
                dealerName={data.dealerName}
                dealerCity={data.city}
              />
            </aside>
          </div>

          {/* Title row */}
          <div className="mt-10">
            <div className="flex flex-wrap items-center gap-3">
              {data.certificationStatus === 'CPO' ? (
                <span className="inline-block bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead text-[10px] px-2.5 py-1 rounded-card">
                  H-D Certified
                </span>
              ) : (
                <span className="inline-block bg-hd-black text-hd-white font-subhead uppercase tracking-subhead text-[10px] px-2.5 py-1 rounded-card">
                  As-Is
                </span>
              )}
            </div>
            <h1 className="font-headline tracking-headline uppercase text-3xl md:text-4xl text-text-on-light mt-3">
              {heading}
            </h1>
            <p className="font-subhead uppercase tracking-subhead text-xs text-gray-600 mt-2">
              {metaLine}
            </p>
          </div>

          {/* Spec rows + EMI calculator */}
          <div className="mt-8 grid lg:grid-cols-[1fr_360px] gap-8 items-start">
            <div>
              {/* "At a glance" strip — facts that aren't already in the
                  meta line (year/km/colour) or the H1, plus the inspection
                  badge. Year + Colour + KM live in the metaLine above; the
                  full spec sheet (Model Family, VIN, etc.) lives under the
                  Specifications tab below. Splitting like this stops the
                  same value from being shown 2-3 times on the page. */}
              <SpecRow
                items={[
                  { label: 'Stock Code', value: stockCode },
                  {
                    label: 'Owners',
                    value: data.owners
                      ? data.owners === 1
                        ? '1 (Single owner)'
                        : `${data.owners}`
                      : '—',
                  },
                  // Mileage isn't on the API contract yet — show — until
                  // the field exists on Listing.
                  { label: 'Mileage (km/L)', value: '—' },
                ]}
              />
              <SpecRow
                items={[
                  {
                    label: 'Inspection',
                    value: data.certificationStatus === 'CPO' ? 'Passed' : 'As-Is',
                  },
                  { label: 'Listed On', value: listedOn },
                  { label: 'Listing Status', value: 'Active' },
                ]}
              />
              <SpecRow
                items={[
                  {
                    label: 'Location',
                    // Combine city + pincode + state so the buyer has the
                    // full mailing context up-front. Falls back to city
                    // only if the dealer record predates the pincode/state
                    // columns.
                    value: [data.city, data.pincode, data.state]
                      .filter(Boolean)
                      .join(' · '),
                  },
                  { label: 'Available For', value: 'Test Ride · Showroom Visit' },
                ]}
                full
              />

              {/* Tabs — Overview | Specifications */}
              <div className="mt-10 border-b border-gray-200 flex gap-1">
                {(['overview', 'specs'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={`px-4 py-2 font-subhead uppercase tracking-subhead text-xs border-b-2 -mb-px transition ${
                      tab === t
                        ? 'border-hd-orange text-text-on-light'
                        : 'border-transparent text-gray-500 hover:text-text-on-light'
                    }`}
                  >
                    {t === 'overview' ? 'Overview' : 'Specifications'}
                  </button>
                ))}
              </div>

              <div className="mt-6">
                {tab === 'overview' ? (
                  <p className="text-gray-700 leading-relaxed whitespace-pre-line text-sm">
                    {data.description}
                  </p>
                ) : (
                  <SpecsTable data={data} />
                )}
              </div>
            </div>

            <aside className="lg:sticky lg:top-20">
              <EmiCalculator
                price={data.price}
                bikeLabel={`${data.year} ${data.modelName}`}
              />
            </aside>
          </div>

          {/* Inspection Passed banner */}
          {data.certificationStatus === 'CPO' && (
            <div className="mt-12 bg-hd-orange/10 border border-hd-orange/40 rounded-card p-5 grid md:grid-cols-[auto_1fr_auto] gap-4 items-center">
              <span className="inline-flex items-center bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead text-[11px] px-3 py-1.5 rounded-card whitespace-nowrap">
                H-D Certified&trade; — Inspection Passed
              </span>
              <p className="text-sm text-gray-700">
                This motorcycle has passed the H-D Certified&trade; 110-Point inspection by an
                authorised technician and qualifies for the 12-month mechanical &amp; electrical
                guarantee, roadside assistance, and HOG membership.
              </p>
              {data.inspectionReportUrl && (
                <a
                  href={data.inspectionReportUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 bg-hd-black text-hd-white font-subhead uppercase tracking-subhead text-[11px] px-4 py-2 rounded-card hover:brightness-125 transition whitespace-nowrap"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  Inspection report
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 6 alternating feature rows — reused from home (compact = no intro) */}
      <BenefitsSection compact />

      <div className="bg-hd-white py-10 text-center border-t border-gray-200">
        <Link
          to="/search"
          className="inline-block bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead px-7 py-3 hover:brightness-110 transition rounded-card"
        >
          View All Approved Used Stock
        </Link>
      </div>

      <DealerLocator />
    </>
  );
}

function SpecRow({
  items,
  full,
}: {
  items: { label: string; value: string }[];
  full?: boolean;
}) {
  const cols = full
    ? 'grid-cols-2 md:grid-cols-2'
    : items.length === 6
    ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6'
    : 'grid-cols-2 md:grid-cols-4';
  return (
    <div className={`grid ${cols} gap-x-6 gap-y-4 border-b border-gray-200 py-5`}>
      {items.map((it) => (
        <div key={it.label}>
          <p className="font-subhead uppercase tracking-subhead text-[10px] text-gray-500">
            {it.label}
          </p>
          <p className="font-subhead uppercase tracking-subhead text-sm text-text-on-light mt-1">
            {it.value || '—'}
          </p>
        </div>
      ))}
    </div>
  );
}

function SpecsTable({ data }: { data: ListingDetail }) {
  // Specifications is the canonical full reference card — every static
  // attribute the buyer might care about that isn't already shown on the
  // header strip / spec rows / dealer card / EMI tile. Stock Code, Owners,
  // Mileage, Inspection, Listed On, Listing Status all live above this
  // tab so they're intentionally NOT repeated here. Year / Colour / KM
  // also live in the meta line directly under the H1 — also dropped here
  // to remove the triple-display the buyer flagged.
  const rows: Array<[string, string]> = [
    ['Model Family', data.modelFamily],
    ['Model', data.modelName],
    ['VIN', data.vin],
    [
      'Certification',
      data.certificationStatus === 'CPO' ? 'H-D Certified™' : 'As-Is',
    ],
  ];
  return (
    <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm bg-surface-light/60 border border-gray-200 rounded-card p-5">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between border-b border-gray-200 pb-2 last:border-b-0">
          <dt className="text-gray-600">{k}</dt>
          <dd className="text-text-on-light text-right font-subhead">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function DetailSkeleton() {
  return (
    <div className="max-w-container mx-auto px-6 py-12">
      <div className="grid lg:grid-cols-[1fr_360px] gap-10">
        <div>
          <div className="aspect-[4/3] bg-gray-200 animate-pulse" />
          <div className="h-12 w-3/4 bg-gray-200 animate-pulse mt-8" />
          <div className="h-8 w-1/3 bg-gray-200 animate-pulse mt-4" />
        </div>
        <div className="h-64 bg-gray-200 animate-pulse" />
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="max-w-container mx-auto px-6 py-24 text-center">
      <h1 className="font-headline text-5xl tracking-headline text-text-on-light">Listing Not Available</h1>
      <p className="text-gray-600 mt-4">
        This bike has been sold or removed. Browse other approved used bikes.
      </p>
      <Link to="/search" className="inline-block mt-8">
        <Button>Search Stock</Button>
      </Link>
    </div>
  );
}
