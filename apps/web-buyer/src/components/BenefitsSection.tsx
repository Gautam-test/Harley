// "What are the benefits" intro + "Overview" bullet list + 6 alternating
// image/text feature rows. Mirrors the frozen Figma "Home" layout exactly.
//
// Reused on the listing detail page (so the same trust copy appears below the
// bike spec). Keep this purely presentational — no data dependencies.

import { HOG_BENEFITS_URL } from '../lib/constants';

interface FeatureRow {
  title: string;
  /** Legacy single-paragraph body. Kept optional for backward compatibility
   *  — when `bullets` is present it wins. */
  body?: string;
  bullets?: string[];
  image: string;
  /** Path under /brand/benefits/ to the brand-supplied SVG icon.
   *  Each SVG already carries the orange circular ring + transparent
   *  fill — no wrapper/background needed. */
  iconSrc: string;
  cta?: { label: string; href: string };
}

// QA BUG_UI_045 (re-submit): two assets per row now —
//   • `iconSrc`  → small 72x72 orange-ringed icon at /brand/benefits/N.svg
//   • `image`    → 786x456 raster-embedded SVG illustration at
//                  /brand/benefits/feature-images/N.svg (brand-supplied)
// Moving the row hero off the external medialinksonline CDN (which was
// returning 404 in QA and collapsing rows 3-6 off-screen) is the actual
// fix for the "halts after row 2" bug — the rows render reliably from
// the in-repo asset regardless of upstream availability.
// Each feature row's body is rendered as a scannable bullet list rather
// than a single paragraph — easier to skim on the home page. The legacy
// `body` field is kept on the type for safety; bullets are preferred
// when both are present.
const FEATURES: FeatureRow[] = [
  {
    title: '110 Point Pre-Delivery Check',
    iconSrc: '/brand/benefits/1.svg',
    image: '/brand/benefits/feature-images/1.svg',
    bullets: [
      'Same standard inspection across all authorised dealers.',
      '110-point check covers the full mechanical and electrical operation of the machine.',
      'Detailed record signed by the performing technician, handed to every customer.',
      'Only after passing can a machine be classed as H-D Certified™ and qualify for the other benefits.',
    ],
  },
  {
    title: 'History Check / HPI Check / Insurance Database',
    iconSrc: '/brand/benefits/2.svg',
    image: '/brand/benefits/feature-images/2.svg',
    bullets: [
      'Background check against finance, theft and insurance write-off databases.',
      'Only motorcycles originally sold by Harley-Davidson® India Pvt Ltd (the importer of record) are accepted.',
    ],
  },
  {
    title: 'Kilometer Verification Check',
    iconSrc: '/brand/benefits/3.svg',
    image: '/brand/benefits/feature-images/3.svg',
    bullets: [
      'Online check cross-references the odometer reading against service records.',
      'Verified KM is confirmed in writing as part of the sale.',
    ],
  },
  {
    title: '12 Month Comprehensive Mechanical & Electrical Component Guarantee',
    iconSrc: '/brand/benefits/4.svg',
    image: '/brand/benefits/feature-images/4.svg',
    bullets: [
      'Minimum 12-month guarantee on mechanical and electrical components.',
      'Optional extension beyond 12 months for added cover.',
      'Protects against unforeseen repair expense.',
    ],
  },
  {
    title: '12 Month Roadside Assistance',
    iconSrc: '/brand/benefits/5.svg',
    image: '/brand/benefits/feature-images/5.svg',
    bullets: [
      '24/7 Roadside Assistance, recovery and onward travel when required.',
      'Provided by Australia Wide Assist as part of the package.',
      'Cover extends automatically if you extend your Guarantee.',
    ],
  },
  {
    title: '12 Month HOG Membership',
    iconSrc: '/brand/benefits/6.svg',
    image: '/brand/benefits/feature-images/6.svg',
    bullets: [
      'First 12 months’ membership of the Harley-Davidson® Owners Group included.',
      'Renewable each year at your option.',
    ],
    cta: { label: 'HOG Benefits Click Here', href: HOG_BENEFITS_URL },
  },
];

// Figma /Customer/Home.png — exact bullet copy from the Overview section.
// QA RE-OPEN: tokens normalised per Figma — hyphenated "12-month" /
// "1-year" + restored ™ on the H-D Certified bullet.
const OVERVIEW_BULLETS = [
  '110-point checklist.',
  "12-month national extended manufacturer's warranty & option to extend up to 36 months (Conditions apply).",
  'Qualification for H.O.G. membership (1 year).',
  '1-year Roadside Assistance (with the option to extend).',
  'H-D Certified™ Custom Coverage.',
];

interface BenefitsSectionProps {
  /** When true, suppress the intro+overview band (useful on listing detail). */
  compact?: boolean;
}

export function BenefitsSection({ compact = false }: BenefitsSectionProps) {
  return (
    <>
      {!compact && (
        // Figma /Customer/Home.png — this section is visibly compact:
        // py-10 outer, mt-4 between heading and body, mt-6 between
        // "What" and "Overview" blocks. text-[13px] body keeps the
        // paragraph tight to the headline.
        // QA BUG_UI_032: tighter typography spec —
        //   • Headings exactly 28px Bold 700 in 1903 Sans (font-subhead).
        //   • Body copy exactly 14px (text-[14px]).
        //   • Subtitle divider uses a simple hyphen "-" (not "–" / "—").
        //   • Wider container (max-w-5xl) so paragraphs don't compress
        //     into a narrow central column on desktop.
        //   • Still center-aligned per BUG_UI_032 + bg-surface-light
        //     soft off-white canvas.
        // QA latest: Overview canvas bg = #EEECEB (warm light grey,
        // not the cooler bg-surface-light), and the inner content
        // gets explicit side-padding gutters (px-8 md:px-12 lg:px-16)
        // so the body copy can't bleed edge-to-edge on ultra-wide
        // screens. Heading size dropped to 26px per Figma spec.
        <section className="py-20 md:py-24 lg:py-28" style={{ backgroundColor: '#EEECEB' }}>
          <div className="max-w-[1241px] mx-auto px-6 sm:px-8">
            <h2 className="text-center font-subhead font-bold tracking-subhead uppercase text-[32px] text-text-on-light leading-tight">
              What Are The Benefits Of H-D Certified&trade; Approved Used Motorcycles?
            </h2>
            <p className="mt-5 text-[18px] text-gray-600 leading-relaxed text-left">
              When you own any Harley-Davidson&reg; motorcycle the expectations are sky high,
              justifiably of course. Choose a H-D Certified&trade; Approved Used
              Harley-Davidson&reg; and you can rest assured they have been rigorously checked
              and certified to earn the honour of being called a H-D Certified&trade; machine.
              You can only purchase H-D Certified&trade; Approved Used Harley-Davidson&reg; machines
              from an authorized Harley-Davidson&reg; dealer. This provides you with 100% certainty and
              the promise that you not only know the difference with your new Motorcycle, but feel it
              too. Your purchase is backed with a comprehensive guarantee and assistance
              package. Please explore below to see the full range of benefits on these
              machines.
            </p>
          </div>

          <div className="max-w-[1241px] mx-auto px-6 sm:px-8 mt-10">
            {/* Per Figma node 434-871: headings centered, body + bullets
                left-aligned within the same 1241px content frame so
                bullet markers sit flush with the body paragraphs' left
                edge. */}
            <h3 className="text-center font-subhead font-bold tracking-subhead uppercase text-[32px] text-text-on-light leading-tight">
              Overview Of H-D Certified&trade; - Ride With Confidence
            </h3>
            <p className="mt-5 text-[18px] text-gray-600 leading-relaxed text-left">
              The desire of H-D Certified&trade; is to become the go to place for all customers
              wanting to purchase a pre-owned Harley-Davidson&reg; motorcycle. The program provides
              customers with the confidence that the pre-owned Motorcycle they purchase is of high
              standard and quality. It is also backed with comprehensive part and labour warranty
              which includes roadside assistance and many other benefits.
            </p>
            <p className="mt-4 text-[18px] text-gray-600 leading-relaxed text-left">
              An H-D Certified&trade; Approved Used motorcycle can be a fantastic first entry
              point to the Harley-Davidson&reg; brand or a cost-effective donor Motorcycle for a custom
              project. Buying an H-D Certified&trade; Approved Used motorcycle also comes with
              several great customer benefits, including:
            </p>
            <ul className="mt-3 text-[18px] text-gray-600 leading-relaxed space-y-1.5 list-disc pl-5 marker:text-hd-orange text-left">
              {OVERVIEW_BULLETS.map((b) => (
                <li key={b} className="pl-1">
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* 6 alternating image/text feature rows. QA latest: row 1 must
          render WHITE (#FFFFFF), row 2 soft-grey (#F5F5F5), and so on
          — odd indices (1, 3, 5 = rows 2, 4, 6) get the grey fill.
          The wrapper colour matches row 1 so the page reads as a
          continuous white-to-grey alternation right from the section
          edge. */}
      <div className="bg-hd-white">
        {FEATURES.map((f, i) => (
          <FeatureSection key={f.title} feature={f} reverse={i % 2 === 1} index={i} />
        ))}
      </div>
    </>
  );
}

function FeatureSection({
  feature,
  reverse,
  index,
}: {
  feature: FeatureRow;
  reverse: boolean;
  index: number;
}) {
  // BUG_UI_004 — overlapping asymmetric grid:
  //
  //   • Images are square-edged (no border-radius), full-bleed in their
  //     column. Drops the rounded-card treatment that gave the rows a
  //     "bubbly" feel against the rugged H-D voice.
  //   • Text tile sits in a raised white card with a soft drop shadow,
  //     intentionally OVERLAPPING the image edge on the opposite side
  //     of the row (margin-left/-right negative pulls it back into the
  //     image gutter). On mobile the overlap collapses to a clean stack.
  //   • Icons rendered inside a thin circular outline (no fill), the
  //     "minimalist wireframe" treatment Figma specifies.
  //   • Headings now use font-subhead (1903 Sans, regular weight) rather
  //     than font-headline (1903 Sans Condensed); the condensed cut was
  //     too vertically compressed for these card titles.
  return (
    // QA latest: row 1 (index 0) = white, row 2 (index 1) = soft
    // #F5F5F5, alternating. Even indices get white, odd indices grey
    // — flipped from the previous pattern that started grey-first.
    <section
      // Tighter vertical padding so each row is ~60-70% of viewport
      // height — when the buyer scrolls to one row, slivers of the prior
      // and next rows (each with its alternating bg colour) peek above
      // and below. Signals "more content here" without needing chevrons
      // or a scroll-snap container.
      className="py-8 md:py-10"
      style={{ backgroundColor: index % 2 === 1 ? '#F5F5F5' : '#FFFFFF' }}
    >
      <div
        className={`max-w-container mx-auto px-6 grid lg:grid-cols-2 gap-0 items-center ${
          reverse ? 'lg:[&>*:first-child]:order-2' : ''
        }`}
      >
        {/* Image column — square-edged per Figma; aspect 4/3 keeps the
            bike framing consistent across rows. QA BUG_UI_045 root
            cause: when the external CDN photo 404'd the row reserved
            no height and the visible page appeared to "halt early"
            after the 2nd row. Fallback to a local placeholder + bg
            colour on the wrapper guarantees every row paints. */}
        <div className="aspect-[16/10] overflow-hidden bg-gray-200">
          <img
            src={feature.image}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
            onError={(e) => {
              const img = e.currentTarget;
              if (!img.dataset.fellBack) {
                img.dataset.fellBack = '1';
                img.src = '/brand/listing-placeholder.svg';
              }
            }}
          />
        </div>
        {/* Text card — raised, drop-shadowed, overlaps the image gutter
            on lg+ via negative margin pulled INTO the image. Sign of
            the margin flips with `reverse` so the overlap always
            extends into the adjacent image column, never out into the
            page gutter. */}
        <div
          className={`bg-hd-white shadow-xl lg:shadow-2xl p-6 md:p-8 lg:p-10 relative lg:z-10 ${
            reverse
              ? 'lg:-mr-16 lg:[&]:order-1'
              : 'lg:-ml-16'
          }`}
        >
          <div className="flex items-start gap-4">
            {/* Brand-supplied SVG (already a 72×72 orange-ringed circle
                with a transparent fill). Sized down to ~56-64px to sit
                comfortably next to the headline. */}
            <img
              src={feature.iconSrc}
              alt=""
              aria-hidden
              className="shrink-0 h-14 w-14 md:h-16 md:w-16"
              width={64}
              height={64}
              decoding="async"
            />
            <div className="min-w-0">
              <h3 className="font-subhead font-bold tracking-subhead uppercase text-lg md:text-xl text-text-on-light leading-tight">
                {feature.title}
              </h3>
              {/* Prefer bullet list when present — easier to scan than a
                  block paragraph. Legacy `body` field still supported for
                  rows that haven't been migrated. Orange disc markers
                  match the home Overview list. */}
              {feature.bullets && feature.bullets.length > 0 ? (
                <ul className="mt-3 text-[16px] text-gray-600 leading-relaxed space-y-2 list-disc pl-5 marker:text-hd-orange">
                  {feature.bullets.map((b) => (
                    <li key={b} className="pl-1">
                      {b}
                    </li>
                  ))}
                </ul>
              ) : feature.body ? (
                <p className="text-[18px] text-gray-600 mt-3 leading-relaxed">{feature.body}</p>
              ) : null}
              {feature.cta && (
                <a
                  href={feature.cta.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-5 bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead px-5 py-2.5 hover:brightness-110 transition text-xs"
                >
                  {feature.cta.label} ↗
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// QA RE-OPEN: FeatureGlyph component removed. Benefit icons are now
// brand-supplied SVGs stored in /public/brand/benefits/ and rendered
// inline via <img> (see FeatureSection above).
