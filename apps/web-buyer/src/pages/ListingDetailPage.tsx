import { useState, useEffect } from 'react';
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
// Client feedback #7: DealerLocator removed from PDP — Find Your Dealer
// feature dropped from the customer portal. The selling dealer's card
// (in the sidebar above) is still surfaced; nearest-3 alternates are
// no longer shown.

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
  /** ACTIVE in normal flow; SOLD only when within the 1-hour grace window
   *  after the dealer marked the bike sold. After the window the API
   *  returns 404 and the buyer hits the NotFound page. */
  status: 'ACTIVE' | 'SOLD';
  soldAt: string | null;
  owners: number | null;
  publishedAt: string | null;
  dealerId: string;
  dealerName: string;
  city: string;
  pincode?: string | null;
  state?: string | null;
  // BUG-039: dealer address + phone surface the actual selling
  // dealer's contact card on the "View Dealer Details" modal.
  dealerAddress?: string | null;
  dealerPhone?: string | null;
  dealerEmail?: string | null;
  registrationNumber?: string | null;
}

// "EMI from" hint reuses the shared helper — same defaults as the
// calculator + search-filter slider so all three figures stay in sync.

// QA: dealers store the bike's km/l mileage as a `Mileage: NN km/l — `
// prefix on the listing description (the API doesn't yet have a
// dedicated column). Peel it off here so we can:
//   1) surface the value in the spec highlights + Specification tab
//   2) keep the human-written part of the description clean in the
//      Overview tab (no leaking of the metadata prefix).
// Falls back to {mileage: null, body: original-description} when there
// is no prefix — older listings just continue to show "—".
const MILEAGE_PREFIX = /^Mileage:\s*(\d{1,3}(?:\.\d{1,2})?)\s*km\/l(?:\s*—\s*|\s*$)/;
function parseMileagePrefix(description: string | null | undefined): {
  mileage: string | null;
  body: string;
} {
  const text = description ?? '';
  const m = text.match(MILEAGE_PREFIX);
  if (!m) return { mileage: null, body: text };
  return { mileage: m[1] ?? null, body: text.slice(m[0].length) };
}

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
  // Client feedback #14: auto-open buyer enquiry popup on first PDP visit
  // per session. Suppressed once an enquiry is submitted this session.
  const [autoOpenEnquiry, setAutoOpenEnquiry] = useState(false);
  useEffect(() => {
    if (!data) return;
    const alreadyDone = sessionStorage.getItem('hd_enquiry_done') === '1';
    const alreadyShown = sessionStorage.getItem('hd_popup_shown') === '1';
    if (!alreadyDone && !alreadyShown) {
      sessionStorage.setItem('hd_popup_shown', '1');
      const t = setTimeout(() => setAutoOpenEnquiry(true), 2000);
      return () => clearTimeout(t);
    }
  }, [data]);

  if (isLoading) return <DetailSkeleton />;
  if (isError && error instanceof ApiError && error.status === 404) return <NotFound />;
  if (!data) return null;

  const heading = `${data.year} ${data.modelName}`;
  // Peel the dealer-keyed Mileage off the description so it can be
  // surfaced in the spec grid + Specification tab, and the Overview
  // copy below shows only the dealer's prose (no metadata prefix).
  const { mileage: mileageValue, body: descriptionBody } = parseMileagePrefix(data.description);
  const mileageDisplay = mileageValue ? `${mileageValue} km/l` : '—';
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

      {/* QA latest: VDP page wrapper uses the soft off-white canvas
          (#F4F4F4 = bg-surface-light) so the tab content cards below
          read as elevated white blocks layered on top of it. */}
      <div className="bg-surface-light text-text-on-light">
        <div className="max-w-container mx-auto px-6 py-6">
          {/* Client feedback #9: breadcrumb removed from customer portal. */}

          {/* Top section — gallery left, price/dealer card right */}
          <div className="grid lg:grid-cols-[1fr_360px] gap-8">
            <div>
              <ImageGallery
                images={data.images}
                alt={heading}
                sold={data.status === 'SOLD'}
                certificationStatus={data.certificationStatus}
              />
            </div>

            <aside id="enquire-sidebar">
              <ListingSidebarCard
                slug={data.slug}
                modelInterest={`${data.year} ${data.modelName}`}
                price={data.price}
                emiFrom={emiFrom}
                dealerId={data.dealerId}
                dealerName={data.dealerName}
                dealerCity={data.city}
                dealerState={data.state ?? null}
                dealerPincode={data.pincode ?? null}
                dealerAddress={data.dealerAddress ?? null}
                dealerPhone={data.dealerPhone ?? null}
                dealerEmail={data.dealerEmail ?? null}
                autoOpen={autoOpenEnquiry}
                onEnquirySubmitted={() => {
                  sessionStorage.setItem('hd_enquiry_done', '1');
                  setAutoOpenEnquiry(false);
                }}
              />
            </aside>
          </div>

          {/* Title + Spec rows + EMI calculator — single grid so the EMI
              Calculator starts horizontally aligned with the H1 heading.
              Left column: CPO chip → H1 → meta line → spec row → tabs.
              Right column: EMI calculator (sticky). */}
          <div className="mt-10 grid lg:grid-cols-[1fr_360px] gap-8 items-start">
            <div>
              {/* Title row — only CPO bikes carry the H-D Certified chip;
                  AS-IS listings render no badge per client request. */}
              {data.certificationStatus === 'CPO' && (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-block bg-hd-black text-hd-white font-subhead uppercase tracking-subhead text-[10px] px-3 py-1.5">
                    H-D Certified
                  </span>
                </div>
              )}
              <h1 className="font-subhead font-bold tracking-subhead uppercase text-3xl md:text-4xl text-text-on-light mt-4 leading-tight">
                {heading}
              </h1>
              <p className="font-subhead uppercase tracking-subhead text-[13px] text-gray-600 mt-3">
                {metaLine}
              </p>

              {/* QA NEW: single comprehensive spec highlights grid per
                  Figma — YEAR, MODEL, CATEGORY, KMS, OWNERS, INSPECTION,
                  MILEAGE, COLOUR, LOCATION, VEHICLE REGISTRATION. Five
                  columns on lg+, two on mobile. The earlier 3-row stack
                  was missing Model / Category / Mileage / Colour /
                  Vehicle Registration. */}
              <div className="mt-8">
              <SpecRow
                items={[
                  { label: 'Year', value: String(data.year) },
                  { label: 'Model', value: data.modelName },
                  { label: 'Category', value: data.modelFamily },
                  { label: 'KMs', value: `${data.kmsDriven.toLocaleString('en-IN')} KM` },
                  {
                    label: 'Owners',
                    value: data.owners
                      ? data.owners === 1
                        ? '1 (Single)'
                        : `${data.owners}`
                      : '—',
                  },
                  {
                    // Client feedback #12: "As-Is" → "Pre-Owned" in spec display.
                    label: 'Inspection',
                    value: data.certificationStatus === 'CPO' ? '110 Pt Passed' : 'Pre-Owned',
                  },
                  { label: 'Mileage', value: mileageDisplay },
                  { label: 'Colour', value: data.colour },
                  {
                    label: 'Location',
                    value: [data.city, data.pincode].filter(Boolean).join(' · '),
                  },
                  // QA BUG-003: previously displayed `stockCode` (last 5
                  // chars of VIN, e.g. "8Y8Y8") which is a stock identifier,
                  // not a registration plate. Real registration comes from
                  // the dealer-entered Listing.registrationNumber field.
                  { label: 'Vehicle Registration', value: data.registrationNumber || '—' },
                ]}
                full
              />
              </div>

              {/* QA latest: tabs + content rendered as ELEVATED white
                  card layered on the soft #F4F4F4 page canvas. Tab
                  selector sits inside the same card so the active
                  underline reads cleanly. */}
              <div className="mt-10 bg-hd-white shadow-sm border border-gray-200">
                <div className="border-b border-gray-200 flex gap-1 px-5 pt-2">
                  {(['overview', 'specs'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTab(t)}
                      className={`px-4 py-3 font-subhead font-bold tracking-subhead uppercase text-xs border-b-2 -mb-px transition ${
                        tab === t
                          ? 'border-hd-orange text-text-on-light'
                          : 'border-transparent text-gray-500 hover:text-text-on-light'
                      }`}
                    >
                      {t === 'overview' ? 'Overview' : 'Specification'}
                    </button>
                  ))}
                </div>

                <div className="p-6 md:p-8">
                  {tab === 'overview' ? (
                    <p className="text-gray-700 leading-7 whitespace-pre-line text-[16px]">
                      {descriptionBody}
                    </p>
                  ) : (
                    <SpecsTable data={data} />
                  )}
                </div>
              </div>
            </div>

            <aside className="lg:sticky lg:top-20">
              <EmiCalculator
                price={data.price}
                bikeLabel={`${data.year} ${data.modelName}`}
              />
            </aside>
          </div>

          {/* QA NEW: 110 PT inspection banner restyle per Figma — orange
              accent CARD on the left (large bold "110 PT" stacked over
              "INSPECTION") sits next to the descriptive copy. Inspection
              report download stays as a black secondary button on the
              right. */}
          {/* QA latest: 110 PT inspection banner ends flush at the
              right edge — the previous black "Inspection Report"
              button on the far right is dropped per Figma. The PDF
              link remains accessible via the dealer card / future
              spec-sheet link if needed. */}
          {data.certificationStatus === 'CPO' && (
            <div className="mt-12">
              <div className="bg-hd-white border border-gray-200 grid md:grid-cols-[auto_1fr] gap-0 items-stretch">
                <div className="bg-hd-orange text-hd-white px-6 py-5 flex flex-col justify-center text-center min-w-[120px]">
                  <span className="font-subhead font-bold tracking-subhead text-3xl leading-none">
                    110 PT
                  </span>
                  <span className="font-subhead font-bold tracking-subhead text-[11px] mt-1.5 uppercase">
                    Inspection
                  </span>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed px-6 py-5">
                  This motorcycle has passed the H-D Certified&trade; 110-Point inspection by an
                  authorised technician and qualifies for the 12-month mechanical &amp; electrical
                  guarantee, roadside assistance, and HOG membership.
                </p>
              </div>
              {/* QA BUG-047: Download Certificate PDF — promoted from a
                  subtle text link to a clearly-visible orange button
                  directly below the 110 PT descriptive section per the
                  QA spec ("clearly visible button/link"). Gated on
                  registrationNumber because the certificate API needs
                  reg-number + inspected-by + certified-on to render; if
                  any are absent the API returns 404 anyway. */}
              {data.registrationNumber && (
                <div className="mt-3 flex justify-end">
                  <a
                    href={`/api/v1/listings/${data.slug}/certificate.pdf`}
                    download
                    className="inline-flex items-center gap-2 bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead text-xs px-5 py-2.5 hover:brightness-110 transition border border-hd-orange"
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
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download Certificate PDF
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 6 alternating feature rows — CPO bikes only (not shown for Pre-Owned AS_IS) */}
      {data.certificationStatus === 'CPO' && <BenefitsSection compact />}

      <div className="bg-hd-white py-6 text-center border-t border-gray-200">
        <Link
          to="/search"
          className="inline-flex items-center gap-3 bg-hd-orange text-hd-black font-subhead font-bold uppercase tracking-subhead px-7 py-3 hover:brightness-110 transition"
        >
          <span>View All Approved Used Stock</span>
          <span aria-hidden className="text-lg leading-none">&rsaquo;</span>
        </Link>
      </div>

      {/* Client feedback #7: nearest-dealers locator removed from PDP. */}

      {/* Mobile-only sticky enquiry bar. Below lg the sidebar gets pushed
          far down the page once the buyer is reading the Overview / spec
          tabs; this rail keeps Price + ENQUIRE one tap away regardless
          of scroll position. Hidden on lg+ where the sidebar stays
          permanently visible on the right. Adds bottom safe-area padding
          for iOS notch devices. */}
      <div
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-hd-white border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] flex items-center gap-3 px-4 py-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="flex-1 min-w-0">
          <p className="font-subhead font-bold tracking-subhead text-lg text-text-on-light leading-none">
            ₹ {data.price.toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wide truncate">
            EMI from ₹ {emiFrom.toLocaleString('en-IN')}/Mo
          </p>
        </div>
        <a
          href="#enquire-sidebar"
          onClick={(e) => {
            e.preventDefault();
            document
              .getElementById('enquire-sidebar')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          className="shrink-0 bg-hd-orange text-hd-black font-subhead font-bold uppercase tracking-subhead text-xs px-5 py-3 hover:brightness-110 transition"
        >
          Enquire Now
        </a>
      </div>
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
  // Column layout — 5 cols on lg+ when caller passes `full` so the
  // consolidated spec highlights grid (Year / Model / Category / KMs /
  // Owners / Inspection / Mileage / Colour / Location / Vehicle Reg)
  // wraps as 5×2 on desktop. Other call sites still get the original
  // 3-col / 4-col layout.
  const cols = full
    ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5'
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
  // Mileage lives in the description prefix until the API has its own
  // column — parse here so the Specification tab mirrors the value
  // shown in the top spec highlights grid.
  const mileage = parseMileagePrefix(data.description).mileage;
  // Specifications is the canonical full reference card — every static
  // attribute the buyer might care about that isn't already shown on the
  // header strip / spec rows / dealer card / EMI tile. Stock Code, Owners,
  // Mileage, Inspection, Listed On, Listing Status all live above this
  // tab so they're intentionally NOT repeated here. Year / Colour / KM
  // also live in the meta line directly under the H1 — also dropped here
  // to remove the triple-display the buyer flagged.
  // QA latest: Specification panel is a comprehensive two-column
  // asymmetric layout — labels left, values right, generous row
  // spacing inside the elevated card. Items match the Figma spec list
  // (Year / Model / Category / KMs / Owners / Inspection / Mileage /
  // Colour / Location / Vehicle Registration / VIN / Certification).
  const rows: Array<[string, string]> = [
    ['Year', String(data.year)],
    ['Model', data.modelName],
    ['Category', data.modelFamily],
    ['KMs', `${data.kmsDriven.toLocaleString('en-IN')} KM`],
    [
      'Owners',
      data.owners
        ? data.owners === 1
          ? '1 (Single owner)'
          : `${data.owners}`
        : '—',
    ],
    [
      'Inspection',
      data.certificationStatus === 'CPO' ? '110-Point Passed' : 'Pre-Owned',
    ],
    ['Mileage', mileage ? `${mileage} km/l` : '—'],
    ['Colour', data.colour],
    [
      'Location',
      [data.city, data.pincode, data.state].filter(Boolean).join(' · '),
    ],
    // QA BUG-003: same fix as the top SpecRow — the truncated VIN tail is
    // not a registration plate; surface the real Listing.registrationNumber.
    ['Vehicle Registration', data.registrationNumber || '—'],
    ['VIN', data.vin],
    [
      'Certification',
      data.certificationStatus === 'CPO' ? 'H-D Certified™' : 'Pre-Owned',
    ],
  ];
  return (
    <dl className="divide-y divide-gray-200">
      {rows.map(([k, v]) => (
        <div
          key={k}
          className="grid grid-cols-[180px_1fr] gap-x-6 py-3 text-sm first:pt-0 last:pb-0"
        >
          <dt className="font-subhead font-bold uppercase tracking-subhead text-[12px] text-gray-500">
            {k}
          </dt>
          <dd className="font-body text-text-on-light">{v}</dd>
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
          <div className="aspect-[16/10] bg-gray-200 animate-pulse" />
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
      <h1 className="font-subhead font-bold text-5xl tracking-subhead uppercase text-text-on-light">Listing Not Available</h1>
      <p className="text-gray-600 mt-4">
        This motorcycle has been sold or removed. Browse other approved used motorcycles.
      </p>
      <Link to="/search" className="inline-block mt-8">
        <Button>Search Stock</Button>
      </Link>
    </div>
  );
}
