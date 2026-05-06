import { Helmet } from 'react-helmet-async';
import { HERO, PageHero } from '../components/PageHero';

interface InfoPageProps {
  variant: 'finance' | 'insurance';
}

const COPY = {
  finance: {
    title: 'Finance Options',
    heroTitle: 'Finance Your',
    heroEmphasis: 'Harley',
    heroImage: HERO.heritage,
    lead: 'Flexible loan options through partner lenders for your H-D Certified motorcycle.',
    sections: [
      { h: 'How it works', p: 'Your authorised dealer connects you with partner lenders. Indicative EMIs are available on every listing detail page using our calculator.' },
      { h: 'What you need', p: 'Standard KYC documents (PAN, Aadhaar, address proof, income proof). Your dealer will guide you through the lender-specific paperwork.' },
      { h: 'Disclaimer', p: 'EMI calculator is indicative only. Final rates and approval are at the lender\'s discretion. H-D Certified does not directly provide loans.' },
    ],
  },
  insurance: {
    title: 'Insurance',
    heroTitle: 'Insure Your',
    heroEmphasis: 'Ride',
    heroImage: HERO.streetBob,
    lead: 'Protect your ride with comprehensive insurance through approved providers.',
    sections: [
      { h: 'Coverage', p: 'Comprehensive policies include third-party liability and own-damage cover, plus optional add-ons like zero-depreciation and roadside assistance.' },
      { h: 'How it works', p: 'Your authorised dealer can connect you with insurance partners during purchase. Renewals are handled directly with the insurer.' },
      { h: 'Disclaimer', p: 'Insurance is provided by third-party insurers. H-D Certified does not underwrite policies and is not a party to insurance contracts.' },
    ],
  },
} as const;

// PRD §6.1.3 — sticky-rail CTAs link out to these informational landing pages.
// (Insurance is static info per Open Question 5 default.)
export function InfoPage({ variant }: InfoPageProps) {
  const c = COPY[variant];
  return (
    <>
      <Helmet>
        <title>{c.title} — H-D Certified</title>
        <meta name="description" content={c.lead} />
      </Helmet>
      <PageHero
        title={c.heroTitle}
        emphasis={c.heroEmphasis}
        subtitle={c.lead}
        image={c.heroImage}
      />
      <div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
        <div className="space-y-8">
          {c.sections.map((s) => (
            <section key={s.h}>
              <h2 className="font-subhead uppercase tracking-subhead text-text-on-light text-lg">
                {s.h}
              </h2>
              <p className="text-gray-700 mt-2 leading-relaxed">{s.p}</p>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
