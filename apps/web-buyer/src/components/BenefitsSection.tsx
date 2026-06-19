// "What are the benefits" intro + "Overview" bullet list + 6 alternating
// image/text feature rows. Mirrors the frozen Figma "Home" layout exactly.
//
// Reused on the listing detail page (so the same trust copy appears below the
// bike spec). Keep this purely presentational — no data dependencies.

import { HOG_BENEFITS_URL } from '../lib/constants';

interface FeatureRow {
  title: string;
  body?: string;
  bullets?: string[];
  /** Paragraph rendered below the bullet list (row 1 only). */
  extra?: string;
  image: string;
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
// Only the "110 Point Pre-Delivery Check" row uses bullets — per client
// request the other 5 rows stay as a single paragraph body. The bullets
// on row 1 are the EXACT original sentences from the prior paragraph,
// just split on sentence boundaries.
const FEATURES: FeatureRow[] = [
  {
    title: '110 Point Pre-Delivery Check',
    iconSrc: '/brand/benefits/1.svg',
    image: '/brand/benefits/feature-images/1.jpg',
    bullets: [
      'Inspection of the technical condition of the motorcycle is the same for all authorised dealers.',
      'It amounts to a check of 110 points covering the whole operation of the machine.',
      'A detailed record signed by the performing technician is available to the customer from each inspection.',
    ],
    extra:
      'Only once this has been done can a machine earn the right to be classed as H-D Certified™ and qualify for the other benefits associated with these premium used motorcycles.',
  },
  {
    // Client feedback #5: replace placeholder copy with client-approved copy.
    title: 'History Check / HPI Check / Insurance Database',
    iconSrc: '/brand/benefits/2.svg',
    body:
      'Motorcycles provided by H-D Certified are supplied with all required documents and proof.',
    image: '/brand/benefits/feature-images/2.jpg',
  },
  {
    title: 'Kilometer Verification Check',
    iconSrc: '/brand/benefits/3.svg',
    body:
      'An online check is performed to verify from records that the KM declared on the motorcycle is correct and confirmed in writing.',
    image: '/brand/benefits/feature-images/3.jpg',
  },
  {
    title: '12 Month Comprehensive Mechanical & Electrical Component Guarantee',
    iconSrc: '/brand/benefits/4.svg',
    body:
      'Once the machine has been H-D Certified™ we back this with a minimum 12 month Guarantee, this can be extended beyond the 12 months to provide you with added protection against unforeseen expense.',
    image: '/brand/benefits/feature-images/4.jpg',
  },
  {
    title: '12 Month Roadside Assistance',
    iconSrc: '/brand/benefits/5.svg',
    body:
      'In addition to the 12 month Guarantee we provide Roadside Assistance (the Roadside assistance package provider is Australia Wide Assist), Recovery and Onward Travel if required 24/7, should you extend your Guarantee then the Assistance package is also extended.',
    image: '/brand/benefits/feature-images/5.jpg',
  },
  {
    title: '12 Month HOG Membership',
    iconSrc: '/brand/benefits/6.svg',
    body:
      'As a H-D Certified™ owner you will receive the first 12 months’ membership of the Harley-Davidson® Owners Group. Each year you will have the choice of renewing your membership.',
    image: '/brand/benefits/feature-images/6.jpg',
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
        <section className="py-20 md:py-24 lg:py-28 bg-surface-light">
          <div className="max-w-[1241px] mx-auto px-6 sm:px-8">
            <h2 className="text-center font-subhead font-bold tracking-subhead uppercase text-[32px] text-text-on-light leading-tight">
              WHAT ARE THE BENEFITS OF H-D CERTIFIED&trade; APPROVED USED MOTORCYCLES?
            </h2>
            <p className="mt-5 text-[18px] text-text-secondary-on-light leading-relaxed text-left">
              When you own any Harley-Davidson&reg; motorcycle the expectations are sky high,
              justifiably of course. Choose a H-D Certified&trade; Approved Used
              Harley-Davidson&reg; and you can rest assured they have been rigorously checked
              and certified to earn the honour of being called a H-D Certified&trade; machine.
              You can only purchase H-D Certified&trade; Approved Used Harley-Davidson&reg; machines
              from an authorized Harley-Davidson&reg; dealer. This provides you with 100% certainty and
              the promise that you not only know the difference with your new motorcycle, but feel it
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
              OVERVIEW OF H-D CERTIFIED&trade; - <span className="text-hd-orange">RIDE</span> WITH CONFIDENCE
            </h3>
            <p className="mt-5 text-[18px] text-text-secondary-on-light leading-relaxed text-left">
              The desire of H-D Certified&trade; is to become the go to place for all customers
              wanting to purchase a pre-owned Harley-Davidson&reg; motorcycle. The program provides
              customers with the confidence that the pre-owned motorcycle they purchase is of high
              standard and quality. It is also backed with comprehensive part and labour warranty
              which includes roadside assistance and many other benefits.
            </p>
            <p className="mt-4 text-[18px] text-text-secondary-on-light leading-relaxed text-left">
              An H-D Certified&trade; Approved Used motorcycle can be a fantastic first entry
              point to the Harley-Davidson&reg; brand or a cost-effective donor motorcycle for a custom
              project. Buying an H-D Certified&trade; Approved Used motorcycle also comes with
              several great customer benefits, including:
            </p>
            <ul className="mt-3 text-[18px] text-text-secondary-on-light leading-relaxed space-y-1.5 list-disc pl-5 marker:text-hd-orange text-left">
              {OVERVIEW_BULLETS.map((b) => (
                <li key={b} className="pl-1">
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* 6 alternating image/text feature rows — clean 50/50 split per
          reference design. Even rows: image left, text right.
          Odd rows: text left, image right. No overlap, no shadow card. */}
      <div>
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
  const rowBg = index % 2 === 0 ? '#FFFFFF' : '#F5F5F5';

  return (
    <section style={{ backgroundColor: rowBg }}>
      <div className="grid lg:grid-cols-2 items-center">

        {/* ── Image column ────────────────────────────────────────── */}
        <div
          className={`flex items-center justify-center p-6 md:p-8 lg:p-10 min-h-[280px] lg:min-h-[400px] ${
            reverse ? 'lg:order-2' : 'lg:order-1'
          }`}
          style={{ backgroundColor: rowBg }}
        >
          <img
            src={feature.image}
            alt=""
            className="w-full h-auto object-contain max-h-[340px]"
            onError={(e) => {
              const img = e.currentTarget;
              if (!img.dataset.fellBack) {
                img.dataset.fellBack = '1';
                img.src = '/brand/listing-placeholder.svg';
              }
            }}
          />
        </div>

        {/* ── Text column ─────────────────────────────────────────── */}
        <div
          className={`flex flex-col justify-center px-8 md:px-10 lg:px-12 py-10 md:py-12 ${
            reverse ? 'lg:order-1' : 'lg:order-2'
          }`}
          style={{ backgroundColor: rowBg }}
        >
          {/* Icon + Title on same row — matches the reference layout */}
          <div className="flex items-center gap-4">
            <img
              src={feature.iconSrc}
              alt=""
              aria-hidden
              className="shrink-0 h-[72px] w-[72px]"
              width={72}
              height={72}
              decoding="async"
            />
            <h3 className="font-subhead font-bold uppercase tracking-subhead text-[20px] md:text-[24px] text-text-on-light leading-snug">
              {feature.title}
            </h3>
          </div>

          {/* Body / bullet list */}
          {feature.bullets && feature.bullets.length > 0 ? (
            <>
              <ul className="mt-5 text-[15px] text-text-secondary-on-light leading-relaxed space-y-3 list-disc pl-4 marker:text-hd-orange">
                {feature.bullets.map((b) => (
                  <li key={b} className="pl-1">{b}</li>
                ))}
              </ul>
              {feature.extra && (
                <p className="mt-4 text-[15px] text-text-secondary-on-light leading-relaxed">{feature.extra}</p>
              )}
            </>
          ) : feature.body ? (
            <p className="mt-5 text-[15px] text-text-secondary-on-light leading-relaxed">{feature.body}</p>
          ) : null}

          {/* Optional CTA — e.g. HOG Benefits */}
          {feature.cta && (
            <a
              href={feature.cta.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-6 bg-hd-orange text-hd-white font-subhead font-bold uppercase tracking-subhead text-xs px-6 py-3 hover:brightness-110 transition w-fit"
            >
              {feature.cta.label}
              <span aria-hidden>→</span>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

// QA RE-OPEN: FeatureGlyph component removed. Benefit icons are now
// brand-supplied SVGs stored in /public/brand/benefits/ and rendered
// inline via <img> (see FeatureSection above).
