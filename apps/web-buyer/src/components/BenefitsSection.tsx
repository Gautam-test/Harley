// "What are the benefits" intro + "Overview" bullet list + 6 alternating
// image/text feature rows. Mirrors the frozen Figma "Home" layout exactly.
//
// Reused on the listing detail page (so the same trust copy appears below the
// bike spec). Keep this purely presentational — no data dependencies.

import { HOG_BENEFITS_URL } from '../lib/constants';

interface FeatureRow {
  title: string;
  body: string;
  bullets?: string[];
  image: string;
  /** Path under /brand/benefits/ to the brand-supplied SVG icon.
   *  Each SVG already carries the orange circular ring + transparent
   *  fill — no wrapper/background needed. */
  iconSrc: string;
  cta?: { label: string; href: string };
}

// QA BUG_UI_045: brand-supplied 1.svg through 6.svg mapped 1:1 by the
// design team to the 6 value-prop blocks. Each SVG is a 72x72
// orange-ringed circle with the icon glyph inside — render straight
// as <img>. (Prior generic names history-check.svg etc. retained on
// disk as a fallback in case the spec renumbers later.)
const FEATURES: FeatureRow[] = [
  {
    title: '110 Point Pre-Delivery Check',
    iconSrc: '/brand/benefits/1.svg',
    body:
      "Inspection of the technical condition of the motorcycle is the same for all authorised dealers. A know-how is a part of 110 points covering the whole operation of the motorcycle. A detailed record signed by the performing technician is available to the customer from each inspection. Only ones that have been done over a roadtest are then right to be classed as H-D Certified™ and qualify for the other benefits associated with these certified used motorcycles.",
    image: 'https://images.medialinksonline.com/8825026x1600x1000xFFFFFFxH.jpg',
  },
  {
    title: 'History Check / HPI Check / Insurance Database',
    iconSrc: '/brand/benefits/2.svg',
    body:
      "In the H-D Certified™ motorcycles are offered at a fixed and transparent price. Cross-checked against the national HPI / insurance database — no outstanding finance, theft markers or hidden write-offs. Every certified motorcycle comes with the verification report shared in writing.",
    image: 'https://images.medialinksonline.com/8822481x1600x1000xFFFFFFxH.jpg',
  },
  {
    title: 'Kilometer Verification Check',
    iconSrc: '/brand/benefits/3.svg',
    body:
      'An online check is performed to verify the records that the KM declared on the motorcycle is correct and confirmed in writing. Every odometer reading is independently corroborated against the motorcycle\'s service history.',
    image: 'https://images.medialinksonline.com/8825071x1600x1000xFFFFFFxH.jpg',
  },
  {
    title: '12 Month Comprehensive Mechanical & Electrical Component Guarantee',
    iconSrc: '/brand/benefits/4.svg',
    body:
      'Once the motorcycle has been H-D Certified™ we back this with a minimum 12-month guarantee. It can be extended beyond the 12 months to provide you with added protection against unforeseen expense.',
    image: 'https://images.medialinksonline.com/8825049x1600x1000xFFFFFFxH.jpg',
  },
  {
    title: '12 Month Roadside Assistance',
    iconSrc: '/brand/benefits/5.svg',
    body:
      'In addition to the 12 month guarantee we provide Roadside Assistance (the Roadside assistance package provider is an Authorised Vehicle Assist). Recovery and Onward Travel if required 24/7, should you accidentally pundoction from the Roadside package is also extended.',
    image: 'https://images.medialinksonline.com/8757963x1600x1000xFFFFFFxH.jpg',
  },
  {
    title: '12 Month HOG Membership',
    iconSrc: '/brand/benefits/6.svg',
    body:
      'As an H-D Certified™ owner you will receive the first 12 months\' membership of the Harley Owners Group. From here you will have the choice of renewing your membership.',
    image: 'https://images.medialinksonline.com/8225108x1600x1000xFFFFFFxH.jpg',
    cta: { label: 'HOG Benefits Click Here', href: HOG_BENEFITS_URL },
  },
];

// Figma /Customer/Home.png — exact bullet copy from the Overview section.
// QA RE-OPEN: tokens normalised per Figma — hyphenated "12-month" /
// "1-year" + restored ™ on the H-D Certified bullet.
const OVERVIEW_BULLETS = [
  '110 point checklist.',
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
        <section className="bg-surface-light py-14 md:py-16 lg:py-20">
          <div className="max-w-5xl mx-auto px-6 md:px-10 text-center">
            <h2 className="font-subhead font-bold tracking-subhead uppercase text-[28px] text-text-on-light leading-tight">
              What Are The Benefits Of H-D Certified&trade; Approved Used Motorcycles?
            </h2>
            <p className="mt-5 text-[14px] text-gray-700 leading-relaxed">
              When you own any Harley-Davidson motorcycle the expectations are sky high,
              justifiably of course. Choose a H-D Certified&trade; Approved Used
              Harley-Davidson and you can rest assured that they have been rigorously checked
              and certified to earn the honour of being called a H-D Certified&trade; machine.
              You can only purchase H-D Certified&trade; Approved Used Harley-Davidson machines
              from an authorised Harley&reg; dealer. This provides you with 100% certainty and
              the promise that you not only know the difference with your new motorcycle, but feel it
              too. Your purchase is backed with a comprehensive guarantee and assistance
              package. Please explore below to see the full range of benefits on these
              motorcycles.
            </p>
          </div>

          <div className="max-w-5xl mx-auto px-6 md:px-10 mt-12 md:mt-16 text-center">
            <h3 className="font-subhead font-bold tracking-subhead uppercase text-[28px] text-text-on-light leading-tight">
              Overview Of H-D Certified&trade; - Ride With Confidence
            </h3>
            <p className="mt-5 text-[14px] text-gray-700 leading-relaxed">
              The desire of H-D Certified&trade; is to become the go to place for all customers
              wanting to purchase a pre-owned Harley-Davidson motorcycle. The program provides
              customers with the confidence that the pre-owned motorcycle they purchase is of high
              standard and quality. It is also backed with comprehensive part and labour warranty
              which includes roadside assistance and many other benefits.
            </p>
            <p className="mt-4 text-[14px] text-gray-700 leading-relaxed">
              An H-D Certified&trade; Approved Used motorcycle can be a fantastic first entry
              point to the Harley-Davidson brand or a cost-effective donor motorcycle for a custom
              project. Buying an H-D Certified&trade; Approved Used motorcycle also comes with
              several great customer benefits, including:
            </p>
            <ul className="mt-4 max-w-2xl mx-auto text-left text-[14px] text-gray-700 leading-relaxed space-y-1.5">
              {OVERVIEW_BULLETS.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* 6 alternating image/text feature rows. */}
      <div className={compact ? 'bg-hd-white' : 'bg-surface-light'}>
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
    <section className={`py-10 md:py-14 ${index % 2 === 1 ? 'bg-hd-white' : 'bg-surface-light'}`}>
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
        <div className="aspect-[4/3] overflow-hidden bg-gray-200">
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
              <p className="text-[15px] text-gray-700 mt-3 leading-relaxed">{feature.body}</p>
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
