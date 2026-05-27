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
<h2>Use Of Cookies By Harley-Davidson&reg;</h2>
<p>Harley-Davidson&reg; websites make use of cookies and web beacons (hereafter referred to as
&ldquo;cookies&rdquo;). These tools consist of small text or pixel files that are stored on
your computer.</p>

<p>Because we value your privacy and want to be transparent in how we collect information
about you, this notice provides details on the cookies we use, how you can oppose their use
and how this will impact your browsing experience.</p>

<h3>What Cookies Do We Use?</h3>
<p>Below we have detailed the categories of cookies set by our websites and their purpose. In
some cases we use third party cookies, in which case the source is also indicated.</p>

<p><strong>Strictly necessary cookies</strong> &mdash; These cookies are essential for you to
browse the website and use its features. Without these cookies we cannot hold items in your
shopping cart while shopping on the site or use certain features to access secure areas of
the site.</p>

<p><strong>Preferences cookies</strong> &mdash; Also known as &ldquo;functionality
cookies,&rdquo; these cookies allow our website to remember choices you have made in the past,
like what language you prefer, what region site you would like to see when you return, or what
your user name and password are so you can automatically log in.</p>

<p><strong>Statistics cookies</strong> &mdash; Also known as &ldquo;performance cookies,&rdquo;
these cookies collect information about how you use a website, like which pages you visited
and which links you clicked on. None of this information can be used to identify you. It is
all aggregated and, therefore, anonymized. Their sole purpose is to improve website functions.
This includes cookies from third-party analytics services as long as the cookies are for the
exclusive use of the owner of the website visited.</p>

<p><strong>Marketing cookies</strong> &mdash; These cookies track your online activity to help
tailor more relevant advertising or to limit how many times you see an ad. This information
may be used by Harley-Davidson&reg; and others to, among other things, analyze and track data,
determine the popularity of certain content, deliver advertising and content targeted to your
interest on our Services and other websites, and better understand your online activity.</p>

<h3>How To Disable Or Enable Cookies?</h3>
<p>You can accept or decline cookies by modifying the settings in your browser. However, if
you disable cookies, you will not be able to use all of the interactive features of the site.
Most web browsers allow you to control the cookies saved on your computer. You can find out
more about cookies, including how to see what cookies have been set and how to manage and
delete them on
<a href="https://allaboutcookies.org/" target="_blank" rel="noopener noreferrer">www.allaboutcookies.org</a>.</p>

<p>To delete, change or manage your cookie settings, select from some of the most popular
browser below to learn more:</p>
<ul>
  <li><a href="https://support.google.com/chrome/answer/95647?hl=en-GB" target="_blank" rel="noopener noreferrer">Chrome</a></li>
  <li><a href="https://support.mozilla.org/en-US/kb/cookies-information-websites-store-on-your-computer" target="_blank" rel="noopener noreferrer">Firefox</a></li>
  <li><a href="https://support.apple.com/en-in/guide/safari/sfri11471/mac" target="_blank" rel="noopener noreferrer">Safari</a></li>
  <li><a href="https://support.microsoft.com/en-US/edge/manage-cookies-in-microsoft-edge-view-allow-block-delete-and-use" target="_blank" rel="noopener noreferrer">Microsoft Edge</a></li>
  <li><a href="https://support.microsoft.com/en-us/topic/delete-and-manage-cookies-168dab11-0753-043d-7c16-ede5947fc64d" target="_blank" rel="noopener noreferrer">Internet Explorer</a></li>
</ul>

<h3>Third-Party Cookies</h3>
<p>In addition, our websites may allow you to &ldquo;share&rdquo; content with friends through
social networks. These social networks may set a cookie when you are logged in to their
service and use the share functionality on our websites. Harley-Davidson&reg; does not control
these cookies. Please check the social networks websites for more information about their
cookies and how they use them.</p>

<h3>How Do I Contact Harley-Davidson&reg;?</h3>
<p>Please see our
<a href="https://www.harley-davidson.com/in/en/footer/utility/privacy-policy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</p>
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
            // QA bug 3: typography drifted across legal / info pages —
            // unified rule set for privacy / terms / about / faq /
            // contact. QA latest (Cookie Notice): cookies-specific
            // overrides bump the h2 main heading to 24px (#1A1A1A,
            // bold 1903 Sans wide) and the h3 sub-headings to 18px.
            // The orange `text-hd-orange` colour on h2 is conditionally
            // suppressed for cookies so the spec colour #1A1A1A
            // dominates.
            //
            //   p / li     → 15px regular, leading 1.7, gray-700, mt-4
            //   h2 (def)   → 22px font-subhead uppercase, hd-orange
            //   h2 (cook)  → 24px font-subhead uppercase, #1A1A1A
            //   h3 (def)   → 16px font-subhead uppercase, text-on-light
            //   h3 (cook)  → 18px font-subhead uppercase, text-on-light
            //   a          → hd-orange, underlined on hover
            className={`
              text-[15px] text-gray-700
              [&>*]:max-w-none
              [&_p]:leading-[1.7]
              [&_p]:mt-4
              [&_p:first-child]:mt-0
              [&_h2]:font-subhead
              [&_h2]:font-bold
              [&_h2]:uppercase
              [&_h2]:tracking-subhead
              [&_h2]:mt-10
              [&_h2]:mb-3
              [&_h2:first-child]:mt-0
              [&_h3]:font-subhead
              [&_h3]:font-bold
              [&_h3]:uppercase
              [&_h3]:tracking-subhead
              [&_h3]:text-text-on-light
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
              ${
                isCookies
                  ? '[&_h2]:text-[24px] [&_h2]:!text-[#1A1A1A] [&_h3]:text-[18px]'
                  : '[&_h2]:text-[22px] [&_h2]:text-hd-orange [&_h3]:text-base'
              }
            `}
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
