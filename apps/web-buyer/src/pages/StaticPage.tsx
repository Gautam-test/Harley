import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { api, ApiError } from '../lib/api';
import { HERO, PageHero } from '../components/PageHero';

interface StaticContentResponse {
  key: string;
  title: string;
  bodyHtml: string;
  updatedAt: string;
}

// FAQ items shown inline on the About page, matching the freeze "Life. Liberty.
// Certified." layout. Sourced from the same content as /faq.
const ABOUT_FAQ: { q: string; a: string }[] = [
  {
    q: 'What does H-D Certified mean?',
    a: 'Each Certified Motorcycle is inspected against Harley-Davidson\'s 110-Point Checklist by an Authorised Dealer. A CPO Certificate, Verified Service History, and Roadside Assistance documents are included with every listing.',
  },
  {
    q: 'Is the EMI calculator a financing offer?',
    a: 'No — the EMI calculator is indicative only. Final loan rates and approval are at the partner lender\'s discretion. H-D Certified does not directly provide loans.',
  },
  {
    q: 'How do I sell my motorcycle?',
    a: 'Use the Sell Your Motorcycle form. An authorised Harley-Davidson dealer will reach out within 48 hours to walk through inspection, paperwork, and a no-obligation valuation.',
  },
  {
    q: 'How long is the warranty?',
    a: 'Every H-D Certified motorcycle includes a 12-month mechanical & electrical guarantee, on top of any remaining factory warranty.',
  },
  {
    q: 'Is roadside assistance included?',
    a: 'Yes — 12 months of complimentary roadside assistance is bundled with every CPO purchase. Contact your dealer for the helpline number.',
  },
];

const ABOUT_CONTACT = {
  phone: '+91 88888 11000',
  email: 'cpo@harley-davidson.in',
};

const FALLBACK_TITLES: Record<string, string> = {
  about: 'About H-D Certified',
  privacy: 'Privacy Policy',
  cookies: 'Cookie Notice',
  terms: 'Terms & Conditions',
  faq: 'Frequently Asked Questions',
  contact: 'Contact Us',
};

// Per-page hero copy + image. Two-word "title / emphasis" pattern matches the
// brand "LIFE. LIBERTY. CERTIFIED." treatment from the freeze designs.
// QA latest (Cookie Notice): cookies hero uses an inverted scheme —
// "Harley-Davidson®" in orange (the EMPHASIS slot) + "Cookie Notice"
// in white (the TITLE slot). PageHero renders `title` (white) then
// `emphasis` (orange), so this ordering correctly produces an orange
// "Harley-Davidson®" followed by a white "Cookie Notice" on the page.
const HERO_COPY: Record<string, { title: string; emphasis: string; image: string }> = {
  // QA latest (About): brand-supplied About.svg outdoor scenic
  // adventure-route asset (twin touring motorcycles by water) — was
  // the indoor streetGlide placeholder. Title row reads "Life.
  // Liberty." in white + "Certified" in orange per the existing
  // Figma frame.
  about: { title: 'Life. Liberty.', emphasis: 'Certified', image: HERO.about },
  faq: { title: 'Frequently', emphasis: 'Asked', image: HERO.sportster },
  privacy: { title: 'Privacy', emphasis: 'Policy', image: HERO.iron883 },
  cookies: { title: 'Cookie Notice', emphasis: 'Harley-Davidson®', image: HERO.iron883 },
  terms: { title: 'Terms &', emphasis: 'Conditions', image: HERO.iron883 },
  contact: { title: 'Contact', emphasis: 'Us', image: HERO.roadKing },
};

// QA latest (About): bundled intro paragraphs so the About page
// never falls through to the "not published yet" placeholder when
// the admin hasn't seeded the API. Mirrors the existing FAQ /
// Contact sections rendered below so the page reads as a single
// continuous narrative. Admin-published bodyHtml takes precedence
// (same pattern as the cookies fallback).
const ABOUT_FALLBACK_HTML = `
<p>The Harley-Davidson&reg; Certified Pre-Owned Marketplace is a dedicated platform for H-D
riders to buy and sell pre-owned motorcycles &mdash; all backed by the trusted dealer network.</p>

<p>Every Certified motorcycle passes a detailed 110-Point Inspection. Every enquiry is verified.
Every transaction is handled through an authorised Harley-Davidson&reg; dealer.</p>
`;

// QA latest (Cookie Notice): full HTML fallback body so the page
// never renders the "not published yet" placeholder. The 6 mandated
// outbound links (allaboutcookies.org + 4 browser guides + the
// corporate privacy policy) are wired as real <a target="_blank"
// rel="noopener noreferrer"> anchors so they're actually clickable
// (raster Content.svg from Figma can't carry working hyperlinks).
// Admin-published bodyHtml takes precedence — when the API returns
// content for `cookies`, this fallback is hidden.
const COOKIE_NOTICE_FALLBACK_HTML = `
<p>This Cookie Notice explains how Harley-Davidson&reg; uses cookies and similar tracking
technologies on the H-D Certified&trade; pre-owned marketplace. By continuing to use this
website you consent to the placement of cookies on your device as described below.</p>

<h2>What Are Cookies?</h2>
<p>Cookies are small text files that a website places on your computer, tablet, or phone when
you visit. They let the site recognise your device on subsequent visits, remember preferences
such as your language or pincode, and help us understand how the site is used so we can
improve it. For a plain-English primer on cookies in general, see
<a href="https://allaboutcookies.org/" target="_blank" rel="noopener noreferrer">allaboutcookies.org</a>.</p>

<h2>How We Use Cookies</h2>
<p>Harley-Davidson&reg; uses cookies for four purposes:</p>
<ul>
  <li><strong>Strictly necessary cookies</strong> &mdash; required for core site functions such as
  signing into your account, submitting a buyer enquiry, or completing OTP verification on a
  trade-in lead. The site cannot function correctly without these.</li>
  <li><strong>Preference cookies</strong> &mdash; remember choices you make (pincode, distance
  radius, search filters) so you don&rsquo;t have to re-enter them on each visit.</li>
  <li><strong>Analytics cookies</strong> &mdash; aggregated, anonymised data about which pages
  buyers visit, which listings convert, and how long sessions last. Used to improve the
  catalogue and the discovery experience.</li>
  <li><strong>Marketing cookies</strong> &mdash; set only after explicit opt-in. Used to show
  relevant H-D advertising on third-party sites and to measure campaign effectiveness.</li>
</ul>

<h2>Managing Cookies in Your Browser</h2>
<p>You can disable, delete, or block cookies at any time through your browser settings. Note
that blocking strictly-necessary cookies will prevent you from signing in or submitting an
enquiry. The major browsers all expose cookie controls under Privacy or Settings:</p>
<ul>
  <li><a href="https://support.google.com/chrome/answer/95647?hl=en-GB" target="_blank" rel="noopener noreferrer">Google Chrome &mdash; Manage cookies</a></li>
  <li><a href="https://support.mozilla.org/en-US/kb/cookies-information-websites-store-on-your-computer" target="_blank" rel="noopener noreferrer">Mozilla Firefox &mdash; Manage cookies</a></li>
  <li><a href="https://support.apple.com/en-in/guide/safari/sfri11471/mac" target="_blank" rel="noopener noreferrer">Apple Safari &mdash; Manage cookies</a></li>
  <li><a href="https://support.microsoft.com/en-US/edge/manage-cookies-in-microsoft-edge-view-allow-block-delete-and-use" target="_blank" rel="noopener noreferrer">Microsoft Edge &mdash; Manage cookies</a></li>
</ul>

<h2>Third-Party Cookies</h2>
<p>Some cookies on this site are set by third parties we work with for analytics, embedded
maps (dealer locator), and finance partner integrations. These third parties may use the
cookies they set to track your activity across other websites. We do not control these
cookies; please refer to the third party&rsquo;s own privacy policy for details.</p>

<h2>How We Protect Your Data</h2>
<p>Personally identifiable information collected through cookies is handled in line with our
corporate privacy policy. For full details, including your rights of access, correction and
erasure, see the Harley-Davidson&reg;
<a href="https://www.harley-davidson.com/in/en/footer/utility/privacy-policy.html" target="_blank" rel="noopener noreferrer">corporate privacy policy</a>.</p>

<h2>Changes To This Notice</h2>
<p>We may update this Cookie Notice from time to time to reflect changes in technology,
regulation, or our business practice. When we do, the &ldquo;as of&rdquo; date at the top of
the page will be updated. Material changes will be announced via the site banner before they
take effect.</p>

<h2>Contact</h2>
<p>If you have questions about how Harley-Davidson&reg; uses cookies, or about this notice in
particular, please reach out through the
<a href="https://www.harley-davidson.com/in/en/footer/utility/privacy-policy.html" target="_blank" rel="noopener noreferrer">corporate privacy contact channel</a>.</p>
`;

// PRD §6.1.7 — content pulled from StaticContent table; admin-editable.
// PRD §9.3 — sanitise HTML on render with DOMPurify before injecting.
export function StaticPage({ contentKey }: { contentKey: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['static', contentKey],
    queryFn: () => api<StaticContentResponse>(`/static/${contentKey}`),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });

  const fallbackTitle = FALLBACK_TITLES[contentKey] ?? contentKey;
  const hero = HERO_COPY[contentKey] ?? {
    title: 'H-D',
    emphasis: 'Certified',
    image: HERO.streetGlide,
  };
  const isMissing = isError && error instanceof ApiError && error.status === 404;
  const isCookies = contentKey === 'cookies';
  const isAbout = contentKey === 'about';

  // Cookies + About pages fall back to bundled HTML if the API
  // hasn't been seeded (or returns 404) so they never show the
  // "not published yet" placeholder per QA. Admin-published
  // bodyHtml always takes precedence.
  const effectiveHtml =
    data?.bodyHtml
      ? DOMPurify.sanitize(data.bodyHtml, {
          ADD_ATTR: ['target', 'rel'],
        })
      : isCookies && isMissing
      ? DOMPurify.sanitize(COOKIE_NOTICE_FALLBACK_HTML, {
          ADD_ATTR: ['target', 'rel'],
        })
      : isAbout && isMissing
      ? DOMPurify.sanitize(ABOUT_FALLBACK_HTML, {
          ADD_ATTR: ['target', 'rel'],
        })
      : '';

  return (
    <>
      <Helmet>
        <title>{data?.title ?? fallbackTitle} — H-D Certified</title>
      </Helmet>
      <PageHero
        title={hero.title}
        emphasis={hero.emphasis}
        image={hero.image}
        size="md"
        // QA latest: cookies hero is solid black (no scenic photo),
        // carries a HOME / COOKIE breadcrumb, and shows a small
        // "Cookie Notice as of October 2020" subtitle under the
        // main heading.
        solidBlack={isCookies}
        // QA latest: HOME / COOKIE on cookies page, HOME / ABOUT US
        // on the About page — current page in orange per Figma.
        breadcrumbs={
          isCookies
            ? [{ label: 'Home', to: '/' }, { label: 'Cookie' }]
            : isAbout
            ? [{ label: 'Home', to: '/' }, { label: 'About Us' }]
            : undefined
        }
        subtitle={isCookies ? 'Cookie Notice as of October 2020' : undefined}
      />
      <div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
        {isLoading && <div className="text-gray-600">Loading…</div>}
        {isMissing && !isCookies && !isAbout && (
          <p className="text-gray-600">
            This content has not been published yet. Check back shortly.
          </p>
        )}
        {(data || effectiveHtml) && (
          <article
            // QA bug 3: typography drifted across legal / info pages — different
            // sizes for the same heading level, inconsistent paragraph spacing,
            // varying link colors. The class chain below pins ALL headings,
            // paragraphs, lists, and links to a single rule set so privacy /
            // terms / about / faq / contact share identical rhythm.
            //
            //   p / li     → 15px regular, leading 1.7, gray-700, mt-4
            //   h2         → 22px font-subhead uppercase, hd-orange, mt-10
            //   h3         → 16px font-subhead uppercase, mt-6
            //   a          → hd-orange, underlined on hover
            //   ul         → disc bullets, indent
            className="
              text-[15px] text-gray-700
              [&>*]:max-w-none
              [&_p]:leading-[1.7]
              [&_p]:mt-4
              [&_p:first-child]:mt-0
              [&_h2]:font-subhead
              [&_h2]:uppercase
              [&_h2]:tracking-subhead
              [&_h2]:text-hd-orange
              [&_h2]:text-[22px]
              [&_h2]:mt-10
              [&_h2]:mb-3
              [&_h2:first-child]:mt-0
              [&_h3]:font-subhead
              [&_h3]:uppercase
              [&_h3]:tracking-subhead
              [&_h3]:text-text-on-light
              [&_h3]:text-base
              [&_h3]:mt-6
              [&_h3]:mb-2
              [&_a]:text-hd-orange
              [&_a]:underline
              [&_a]:underline-offset-2
              [&_a:hover]:brightness-110
              [&_ul]:list-disc
              [&_ul]:pl-6
              [&_ul]:mt-3
              [&_ul]:space-y-1
              [&_ol]:list-decimal
              [&_ol]:pl-6
              [&_ol]:mt-3
              [&_ol]:space-y-1
              [&_li]:leading-[1.7]
              [&_strong]:text-text-on-light
              [&_strong]:font-subhead
            "
            dangerouslySetInnerHTML={{ __html: effectiveHtml }}
          />
        )}

        {contentKey === 'about' && (
          <>
            <section className="mt-14 pt-10 border-t border-gray-200">
              <h2 className="text-center font-subhead font-bold tracking-subhead uppercase text-2xl md:text-3xl text-text-on-light">
                Frequently Asked
              </h2>
              <div className="mt-8 space-y-3">
                {ABOUT_FAQ.map((item, i) => (
                  <FaqItem key={item.q} item={item} defaultOpen={i === 0} />
                ))}
              </div>
            </section>

            <section className="mt-14 pt-10 border-t border-gray-200">
              <h2 className="font-subhead font-bold tracking-subhead uppercase text-2xl md:text-3xl text-text-on-light">
                Contact
              </h2>
              <dl className="mt-5 space-y-2 text-sm">
                <div className="flex flex-wrap items-baseline gap-3">
                  <dt className="font-subhead uppercase tracking-subhead text-[11px] text-gray-500 w-16">
                    Phone
                  </dt>
                  <dd>
                    <a
                      href={`tel:${ABOUT_CONTACT.phone.replace(/\s+/g, '')}`}
                      className="text-text-on-light hover:text-hd-orange"
                    >
                      {ABOUT_CONTACT.phone}
                    </a>
                  </dd>
                </div>
                <div className="flex flex-wrap items-baseline gap-3">
                  <dt className="font-subhead uppercase tracking-subhead text-[11px] text-gray-500 w-16">
                    Email
                  </dt>
                  <dd>
                    <a
                      href={`mailto:${ABOUT_CONTACT.email}`}
                      className="text-text-on-light hover:text-hd-orange"
                    >
                      {ABOUT_CONTACT.email}
                    </a>
                  </dd>
                </div>
              </dl>
            </section>
          </>
        )}
      </div>
    </>
  );
}

function FaqItem({
  item,
  defaultOpen,
}: {
  item: { q: string; a: string };
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    // QA latest: active accordion frame = 1.5px solid #FF5500 with
    // absolute sharp corners (was 1px border-hd-orange). The closed
    // state keeps a thin grey separator. Inline style for the
    // expanded border because Tailwind doesn't ship a 1.5px utility
    // out-of-the-box for arbitrary colours; we need pixel-perfect
    // parity with the Figma spec on both colour and stroke width.
    <div
      className="transition rounded-none"
      style={
        open
          ? { border: '1.5px solid #FF5500', backgroundColor: 'rgba(255, 85, 0, 0.05)' }
          : { border: '1px solid #E5E7EB' }
      }
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
      >
        {/* QA latest: question header pinned to 16px (was text-sm /
            14px) per Figma. Still 1903 Sans wide bold uppercase. */}
        <span className="font-subhead font-bold uppercase tracking-subhead text-[16px] text-text-on-light">
          {item.q}
        </span>
        <span
          className={`font-headline text-hd-orange text-lg leading-none transition-transform ${
            open ? 'rotate-45' : ''
          }`}
          aria-hidden
        >
          +
        </span>
      </button>
      {open && (
        // QA latest: body answer pinned to 14px per Figma.
        <p className="px-5 pb-5 text-[14px] text-gray-700 leading-relaxed">{item.a}</p>
      )}
    </div>
  );
}
