// "What are the benefits" intro + "Overview" bullet list + 6 alternating
// image/text feature rows. Mirrors the frozen Figma "Home" layout exactly.
//
// Reused on the listing detail page (so the same trust copy appears below the
// bike spec). Keep this purely presentational — no data dependencies.

import { HOG_BENEFITS_URL } from '../lib/constants';

type FeatureIcon = 'clipboard' | 'shield' | 'odometer' | 'gear' | 'sos' | 'hog';

interface FeatureRow {
  title: string;
  body: string;
  bullets?: string[];
  image: string;
  icon: FeatureIcon;
  cta?: { label: string; href: string };
}

const FEATURES: FeatureRow[] = [
  {
    title: '110 Point Pre-Delivery Check',
    icon: 'clipboard',
    body:
      "Inspection of the technical condition of the motorcycle is the same for all authorised dealers. A know-how is a part of 110 points covering the whole operation of the motorcycle. A detailed record signed by the performing technician is available to the customer from each inspection. Only ones that have been done over a roadtest are then right to be classed as H-D Certified™ and qualify for the other benefits associated with these certified used motorcycles.",
    image: 'https://images.medialinksonline.com/8825026x1600x1000xFFFFFFxH.jpg',
  },
  {
    title: 'History Check / HPI Check / Insurance Database',
    icon: 'shield',
    body:
      "In the H-D Certified™ motorcycles are offered at a fixed and transparent price. Cross-checked against the national HPI / insurance database — no outstanding finance, theft markers or hidden write-offs. Every certified motorcycle comes with the verification report shared in writing.",
    image: 'https://images.medialinksonline.com/8822481x1600x1000xFFFFFFxH.jpg',
  },
  {
    title: 'Kilometer Verification Check',
    icon: 'odometer',
    body:
      'An online check is performed to verify the records that the KM declared on the motorcycle is correct and confirmed in writing. Every odometer reading is independently corroborated against the motorcycle\'s service history.',
    image: 'https://images.medialinksonline.com/8825071x1600x1000xFFFFFFxH.jpg',
  },
  {
    title: '12 Month Comprehensive Mechanical & Electrical Component Guarantee',
    icon: 'gear',
    body:
      'Once the motorcycle has been H-D Certified™ we back this with a minimum 12-month guarantee. It can be extended beyond the 12 months to provide you with added protection against unforeseen expense.',
    image: 'https://images.medialinksonline.com/8825049x1600x1000xFFFFFFxH.jpg',
  },
  {
    title: '12 Month Roadside Assistance',
    icon: 'sos',
    body:
      'In addition to the 12 month guarantee we provide Roadside Assistance (the Roadside assistance package provider is an Authorised Vehicle Assist). Recovery and Onward Travel if required 24/7, should you accidentally pundoction from the Roadside package is also extended.',
    image: 'https://images.medialinksonline.com/8757963x1600x1000xFFFFFFxH.jpg',
  },
  {
    title: '12 Month HOG Membership',
    icon: 'hog',
    body:
      'As an H-D Certified™ owner you will receive the first 12 months\' membership of the Harley Owners Group. From here you will have the choice of renewing your membership.',
    image: 'https://images.medialinksonline.com/8225108x1600x1000xFFFFFFxH.jpg',
    cta: { label: 'HOG Benefits Click Here', href: HOG_BENEFITS_URL },
  },
];

// Figma /Customer/Home.png — exact bullet copy from the Overview section.
// Different (and shorter) than the FEATURES titles above; these are the
// "benefits summary" bullets, not the feature-row titles.
const OVERVIEW_BULLETS = [
  '110 point checklist.',
  "12 month national extended manufacturer's warranty & option to extend up to 36 months (Conditions apply).",
  'Qualification for H.O.G. membership (1 year).',
  '1 year Roadside Assistance (with the option to extend).',
  'HD Certified Custom Coverage.',
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
        // QA Bug 21 (Figma parity on benefits/overview):
        //   – outer padding bumped (py-14 → py-16/20) so the section
        //     breathes against the dark hero band above and the alternating
        //     feature rows below.
        //   – max-width widened (max-w-3xl → max-w-4xl) so horizontal
        //     gutters on desktop match the rest of the home rhythm.
        //   – body copy raised to text-[15px]/text-base so it reads as
        //     long-form rather than caption text.
        //   – section headings step up to text-3xl/4xl, matching the
        //     Figma hierarchy between hero H1 and section H2.
        <section className="bg-hd-white py-14 md:py-16 lg:py-20">
          <div className="max-w-4xl mx-auto px-6 md:px-8 text-center">
            <h2 className="font-headline tracking-headline uppercase text-3xl md:text-4xl text-text-on-light leading-tight">
              What Are The Benefits Of H-D Certified&trade; Approved Used Motorcycles?
            </h2>
            <p className="mt-6 text-[15px] md:text-base text-gray-700 leading-relaxed">
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

          <div className="max-w-4xl mx-auto px-6 md:px-8 mt-10 md:mt-14 text-center">
            <h3 className="font-headline tracking-headline uppercase text-3xl md:text-4xl text-text-on-light leading-tight">
              Overview Of H-D Certified&trade; — Ride With Confidence
            </h3>
            <p className="mt-6 text-[15px] md:text-base text-gray-700 leading-relaxed">
              The desire of H-D Certified&trade; is to become the go to place for all customers
              wanting to purchase a pre-owned Harley-Davidson motorcycle. The program provides
              customers with the confidence that the pre-owned motorcycle they purchase is of high
              standard and quality. It is also backed with comprehensive part and labour warranty
              which includes roadside assistance and many other benefits.
            </p>
            <p className="mt-4 text-[15px] md:text-base text-gray-700 leading-relaxed">
              An H-D Certified&trade; Approved Used motorcycle can be a fantastic first entry
              point to the Harley-Davidson brand or a cost-effective demo motorcycle for a custom
              project. Buying an H-D Certified&trade; Approved Used motorcycle also comes with
              several great customer benefits, including:
            </p>
            {/* Bullets render as plain sentence-case body text per Figma
                /Customer/Home.png — earlier change to uppercase subhead
                caps was an overcorrection. Keep the orange list-marker
                for the brand accent, otherwise inherit the surrounding
                paragraph rhythm so the list reads as continuation of
                the overview copy above it. */}
            <ul className="mt-4 max-w-2xl mx-auto text-left list-disc pl-6 marker:text-hd-orange space-y-1.5 text-[15px] md:text-base text-gray-700 leading-relaxed">
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
  // Alternate between transparent and white-card so the rows visually separate.
  return (
    <section className={index % 2 === 0 ? 'py-10 md:py-12' : 'py-10 md:py-12 bg-hd-white'}>
      <div
        className={`max-w-container mx-auto px-6 grid lg:grid-cols-2 gap-8 lg:gap-14 items-center ${
          reverse ? 'lg:[&>*:first-child]:order-2' : ''
        }`}
      >
        <div className="aspect-[4/3] bg-gray-200 overflow-hidden rounded-card">
          <img
            src={feature.image}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
          />
        </div>
        <div>
          <div className="flex items-start gap-4">
            <span className="shrink-0 h-10 w-10 md:h-12 md:w-12 inline-flex items-center justify-center rounded-card bg-hd-orange text-hd-white">
              <FeatureGlyph icon={feature.icon} />
            </span>
            <div>
              <h3 className="font-headline tracking-headline uppercase text-xl md:text-2xl text-text-on-light leading-tight">
                {feature.title}
              </h3>
              <p className="text-sm text-gray-700 mt-3 leading-relaxed">{feature.body}</p>
              {feature.cta && (
                <a
                  href={feature.cta.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-5 bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead px-5 py-2.5 hover:brightness-110 transition rounded-card text-xs"
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

// Figma /Customer/Home.png — each feature row carries a small rounded-square
// orange tile with a white pictogram (clipboard / shield / odometer / gear /
// SOS / HOG). Stroke-only line icons read clearly at the 24px size used in
// the design.
function FeatureGlyph({ icon }: { icon: FeatureIcon }) {
  const stroke: React.SVGProps<SVGSVGElement> = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className: 'w-6 h-6',
    'aria-hidden': true,
  };
  switch (icon) {
    case 'clipboard':
      return (
        <svg {...stroke}>
          <rect x="6" y="4" width="12" height="16" rx="2" />
          <path d="M9 4h6v3H9z" />
          <path d="M9 11h6M9 15h4" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...stroke}>
          <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6l8-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case 'odometer':
      return (
        <svg {...stroke}>
          <path d="M3 14a9 9 0 0118 0" />
          <path d="M12 14l4-4" />
          <circle cx="12" cy="14" r="1" fill="currentColor" />
          <path d="M3 14h2M19 14h2M12 5v2" />
        </svg>
      );
    case 'gear':
      return (
        <svg {...stroke}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
        </svg>
      );
    case 'sos':
      return (
        <svg {...stroke}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12c0-1 .8-2 2-2s2 1 2 2-.8 2-2 2c-1.2 0-2 1-2 2" />
          <path d="M16 10v4M14 10h4M14 14h4" />
        </svg>
      );
    case 'hog':
      // HOG = simple bar logotype since there's no licensed mark — Figma uses
      // a simple HOG glyph in the same orange tile.
      return (
        <svg viewBox="0 0 32 24" className="w-7 h-5" aria-hidden>
          <text
            x="16"
            y="17"
            textAnchor="middle"
            fontFamily="Inter, sans-serif"
            fontWeight="700"
            fontSize="11"
            fill="currentColor"
          >
            HOG
          </text>
        </svg>
      );
  }
}
