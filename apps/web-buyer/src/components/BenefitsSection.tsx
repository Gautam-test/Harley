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
  cta?: { label: string; href: string };
}

const FEATURES: FeatureRow[] = [
  {
    title: '110 Point Pre-Delivery Check',
    body:
      "Inspection of the technical condition of the motorcycle is the same for all authorised dealers. A know-how is a part of 110 points covering the whole operation of the motorcycle. A detailed record signed by the performing technician is available to the customer from each inspection. Only ones that have been done over a roadtest are then right to be classed as H-D Certified™ and qualify for the other benefits associated with these certified used bikes.",
    image: 'https://images.medialinksonline.com/8825026x1600x1000xFFFFFFxH.jpg',
  },
  {
    title: 'History Check / HPI Check / Insurance Database',
    body:
      "In the H-D Certified™ motorcycles are offered at a fixed and transparent price. Cross-checked against the national HPI / insurance database — no outstanding finance, theft markers or hidden write-offs. Every certified bike comes with the verification report shared in writing.",
    image: 'https://images.medialinksonline.com/8822481x1600x1000xFFFFFFxH.jpg',
  },
  {
    title: 'Kilometer Verification Check',
    body:
      'An online check is performed to verify the records that the KM declared on the bike is correct and confirmed in writing. Every odometer reading is independently corroborated against the bike\'s service history.',
    image: 'https://images.medialinksonline.com/8825071x1600x1000xFFFFFFxH.jpg',
  },
  {
    title: '12 Month Comprehensive Mechanical & Electrical Component Guarantee',
    body:
      'Once the bike has been H-D Certified™ we back this with a minimum 12-month guarantee. It can be extended beyond the 12 months to provide you with added protection against unforeseen expense.',
    image: 'https://images.medialinksonline.com/8825049x1600x1000xFFFFFFxH.jpg',
  },
  {
    title: '12 Month Roadside Assistance',
    body:
      'In addition to the 12 month guarantee we provide Roadside Assistance (the Roadside assistance package provider is an Authorised Vehicle Assist). Recovery and Onward Travel if required 24/7, should you accidentally pundoction from the Roadside package is also extended.',
    image: 'https://images.medialinksonline.com/8757963x1600x1000xFFFFFFxH.jpg',
  },
  {
    title: '12 Month HOG Membership',
    body:
      'As an H-D Certified™ owner you will receive the first 12 months\' membership of the Harley Owners Group. From here you will have the choice of renewing your membership.',
    image: 'https://images.medialinksonline.com/8225108x1600x1000xFFFFFFxH.jpg',
    cta: { label: 'HOG Benefits Click Here', href: HOG_BENEFITS_URL },
  },
];

const OVERVIEW_BULLETS = [
  '110 point pre-delivery check',
  'History check / HPI check / Insurance database',
  'Kilometer verification check',
  '12 month comprehensive mechanical & electrical component guarantee',
  '12 month roadside assistance',
  '12 month HOG membership',
];

interface BenefitsSectionProps {
  /** When true, suppress the intro+overview band (useful on listing detail). */
  compact?: boolean;
}

export function BenefitsSection({ compact = false }: BenefitsSectionProps) {
  return (
    <>
      {!compact && (
        <section className="bg-hd-white py-16 md:py-20">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <h2 className="font-headline tracking-headline uppercase text-2xl md:text-3xl text-text-on-light">
              What Are The Benefits Of H-D Certified&trade; Approved Used Bikes?
            </h2>
            <div className="mt-6 space-y-4 text-gray-700 leading-relaxed text-sm md:text-base">
              <p>
                When you own a Harley-Davidson&trade; motorcycle the expectations are sky high.
                Just like H-D itself, the Harley-Davidson Certified™ Approved Used Harley-Davidson
                programme has one common goal — that the bike you ride away with stands up to those
                expectations. Every Harley-Davidson dealer is a member of the H-D Certified™
                programme, and our role is to ensure that every bike sold under this banner is up
                to the technical, cosmetic and reliability standard set by H-D itself.
              </p>
              <p>
                This provides you with 100% certainty next to consumer that you are buying not just
                any used bike. You're buying a motorcycle that you can have confidence in —
                inspected to the same factory-grade benchmark as a brand-new Harley-Davidson.
              </p>
            </div>
          </div>

          <div className="max-w-3xl mx-auto px-6 mt-14 text-center">
            <h3 className="font-headline tracking-headline uppercase text-2xl md:text-3xl text-text-on-light">
              Overview Of H-D Certified&trade; — Ride With Confidence
            </h3>
            <p className="text-sm text-gray-700 mt-5 leading-relaxed">
              The basis of H-D Certified™ is to bring all dealers together to use the same
              certified standard for offering the best in pre-owned Harley-Davidson motorcycles to
              customers. The programme combines with the conditions that the motorcycle has to
              perform under to qualify for certification, and the benefits that the customer
              experiences once a bike under this banner is purchased. The programme considers all
              the conditions that need to be met for a certain quality &amp; reliability standard
              expected when buying an H-D Certified™ Approved Used motorcycle alongside the
              warranty which includes assistance and many other benefits.
            </p>
            <ul className="mt-6 max-w-xl mx-auto text-left text-sm text-gray-700 leading-relaxed list-disc pl-6 marker:text-hd-orange space-y-1.5">
              {OVERVIEW_BULLETS.map((b) => (
                <li key={b}>{b}</li>
              ))}
              <li className="text-gray-500 list-none -ml-6 pt-2">
                Qualifies for HOG membership (1 year)
              </li>
              <li className="text-gray-500 list-none -ml-6">
                Have Roadside Assistance (with the option to extend)
              </li>
              <li className="text-gray-500 list-none -ml-6">
                H-D Certified Cosmetic Coverage
              </li>
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
            <span className="hidden md:flex shrink-0 h-12 w-12 items-center justify-center rounded-full bg-hd-orange/10 border border-hd-orange/40 text-hd-orange font-headline tracking-headline">
              <CheckMark />
            </span>
            <div>
              <h3 className="font-headline tracking-headline uppercase text-xl md:text-2xl text-text-on-light leading-tight">
                {feature.title}
              </h3>
              <p className="text-sm text-gray-700 mt-3 leading-relaxed">{feature.body}</p>
              {feature.cta && (
                <a
                  href={feature.cta.href}
                  className="inline-block mt-5 bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead px-5 py-2.5 hover:brightness-110 transition rounded-card text-xs"
                >
                  {feature.cta.label}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CheckMark() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12l4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
