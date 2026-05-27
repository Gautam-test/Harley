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

// QA latest: shorthand for the canonical Harley-Davidson India privacy
// page — every "How do I contact" / "Opt-Out" / TOC anchor on the
// Privacy fallback page below routes here.
const HD_PRIVACY = 'https://www.harley-davidson.com/in/en/footer/utility/privacy-policy.html';
const HD_PRIVACY_CONTACT = `${HD_PRIVACY}#contacthd`;
const HD_PRIVACY_OPT = `${HD_PRIVACY}#opt`;

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
  // QA latest (Privacy): hero is solid black, no scenic photo. Title
  // row reads "Privacy" white + "Policy" orange per Figma.
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

// QA latest (Privacy Policy): bundled fallback so the Privacy page
// never falls through to the "not published yet" placeholder. Same
// pattern as cookies + about: admin-published bodyHtml takes
// precedence when present. Every section heading + sub-section link
// here is wired to its canonical anchor on the Harley-Davidson India
// corporate privacy page (https://www.harley-davidson.com/in/en/
// footer/utility/privacy-policy.html#<anchor>) so a reader who needs
// the full legal text can deep-link straight there.
//
// Special links per QA spec:
//   • "harley-davidson.com" in "How do I access or change…" →
//     https://www.harley-davidson.com/in/en/index.html
//   • "Data Privacy Request Form" in "Exercising Your Rights" →
//     https://submit-irm.trustarc.com/services/validation/
//     7065b8e2-638c-44e3-9be8-1f9a741ddb44
//   • "DataPrivacy@Harley-Davidson.com" → mailto: (opens default
//     mail client)
//   • "1-800-258-2464" → tel: (mobile picker)
//   • "click [here]" in cookies/tracking section →
//     https://www.harley-davidson.com/in/en/footer/utility/
//     cookie-policy.html
const PRIVACY_FALLBACK_HTML = `
<p>Welcome to Harley-Davidson&reg;. Our primary goal in collecting your personal information
is to enable us to provide our products and services to you and help personalize your
interactions and experiences with us. This notice explains what personal information we may
collect from you, when we may collect it, how we may use and disclose it, and your rights
regarding our use of it. Before using our websites, our mobile app and any products or
services purchased or subscribed to via our websites and mobile app and by
submitting/providing your personal information, please make sure to read this Privacy Notice
carefully.</p>

<p><strong>Please note:</strong> in the event of any discrepancy or inconsistency between
this Privacy Notice and any applicable laws (including but not limited to the Digital
Personal Data Protection Law (&ldquo;DPDP&rdquo;)), such applicable laws shall prevail and
this Privacy Notice shall be deemed to be automatically amended to be consistent with the
applicable laws.</p>

<h2>Harley-Davidson&reg; Commitment To Your Privacy</h2>
<ul>
  <li><a href="${HD_PRIVACY}#who" target="_blank" rel="noopener noreferrer">Who is Harley-Davidson&reg;?</a></li>
  <li><a href="${HD_PRIVACY}#what" target="_blank" rel="noopener noreferrer">What kind of information does Harley-Davidson&reg; collect and when?</a></li>
  <li><a href="${HD_PRIVACY}#how" target="_blank" rel="noopener noreferrer">How does Harley-Davidson&reg; use my information?</a></li>
  <li><a href="${HD_PRIVACY}#cookies" target="_blank" rel="noopener noreferrer">How does Harley-Davidson&reg; use Cookies or tracking?</a></li>
  <li><a href="${HD_PRIVACY}#share" target="_blank" rel="noopener noreferrer">Does Harley-Davidson&reg; share my information?</a></li>
  <li><a href="${HD_PRIVACY}#change" target="_blank" rel="noopener noreferrer">How do I access or change my information?</a></li>
  <li><a href="${HD_PRIVACY}#choices" target="_blank" rel="noopener noreferrer">How do I make choices about receiving promotional communication?</a></li>
  <li><a href="${HD_PRIVACY_OPT}" target="_blank" rel="noopener noreferrer">How do I Opt-In or Opt-Out of Promotional Communications?</a></li>
  <li><a href="${HD_PRIVACY}#dealers" target="_blank" rel="noopener noreferrer">Does this govern my communications with Harley-Davidson&reg; Dealers?</a></li>
  <li><a href="${HD_PRIVACY}#personal" target="_blank" rel="noopener noreferrer">How does Harley-Davidson&reg; protect my personal information?</a></li>
  <li><a href="${HD_PRIVACY}#children" target="_blank" rel="noopener noreferrer">How does Harley-Davidson&reg; protect Children&rsquo;s privacy?</a></li>
  <li><a href="${HD_PRIVACY}#secure" target="_blank" rel="noopener noreferrer">How do I know my personal information is secure?</a></li>
  <li><a href="${HD_PRIVACY}#websites" target="_blank" rel="noopener noreferrer">What about links to other websites?</a></li>
  <li><a href="${HD_PRIVACY}#updates" target="_blank" rel="noopener noreferrer">How am I updated about changes to the Harley-Davidson&reg; Privacy Notice?</a></li>
  <li><a href="${HD_PRIVACY}#questions" target="_blank" rel="noopener noreferrer">Who do I contact with questions on the Privacy Notice?</a></li>
  <li><a href="${HD_PRIVACY}#privacy" target="_blank" rel="noopener noreferrer">Your Privacy Rights under the DPDP</a></li>
  <li><a href="${HD_PRIVACY}#rights" target="_blank" rel="noopener noreferrer">Exercising Your Rights</a></li>
  <li><a href="${HD_PRIVACY_CONTACT}" target="_blank" rel="noopener noreferrer">How do I contact Harley-Davidson&reg;?</a></li>
</ul>

<h2>Who Is Harley-Davidson&reg;?</h2>
<p>For the purposes of this Notice, Harley-Davidson&reg; is Harley-Davidson&reg;, Inc. and
its subsidiary and affiliate entities around the world, including the local
Harley-Davidson&reg; company in your country (excluding Harley-Davidson&reg; Financial
Services, Inc. and its subsidiary entities). Harley-Davidson&reg; includes
Harley-Davidson&reg; Motor Company and Harley-Davidson&reg; Dealer Systems.</p>
<p>Harley-Davidson&reg; HOG Chapters have their own privacy practices and privacy notices,
including their own opt-in and opt-out processes. Except to the extent specified in this
Privacy Notice, this Privacy Notice does not apply to them.</p>
<p>Harley-Davidson&reg; dealers operate independently from Harley-Davidson&reg;. This Privacy
Notice also does not apply to them. Please contact the dealer or visit the dealer website to
learn more about its privacy practices.</p>

<h2>What Kind Of Personal Information Does Harley-Davidson&reg; Collect And When?</h2>
<p>We may collect personal information from you when you visit one of our websites or
stores, use our mobile app, place an order with us online or by phone, make an in-store
purchase, save your information with us online, contact us with a question or concern, or
participate in a contest, promotion, survey, or marketing campaign either online or physical
event.</p>
<p>If we do not collect this personal information, we may not be able to provide you with
the products and services you have requested. For the purposes of this Privacy Notice,
personal information may include, but is not limited to, your name, email address, postal
address, phone number, mobile phone ID, location data, gender, birthday, personal interests,
and other information related to an identified or identifiable natural person, but does not
include anonymized information.</p>
<p>We maintain a record of your product and service interests and the purchases you make and
services you subscribe to online, by phone, or in our stores. Information collected may be
combined with information we acquire from our joint marketing partners or other unrelated
third parties as permitted by applicable law.</p>

<h3>Consent</h3>
<p>Privacy legislation requires Harley-Davidson&reg; to obtain the consent of an individual
to the collection, use or disclosure of personal information in many circumstances, unless
other legal bases are available under applicable law.</p>
<p>By providing your personal information to Harley-Davidson&reg; and giving consent where
we require you to do so, you agree that Harley-Davidson&reg; may process (including collect,
use, disclose, etc.) your personal information in accordance with this Privacy Notice and as
otherwise permitted or required by law. Where a separate consent is required by applicable
law, we will seek your separate consent accordingly.</p>
<p>If you need to provide Harley-Davidson&reg; with personal information about other
individuals or if you allow other individuals to use your vehicle, prior to your disclosure
to Harley-Davidson&reg; or the use of your vehicle by other individuals, you should give a
copy of or a link to this notice to each individual to whom that information relates and
obtain the consent of such individual(s) for the collection, use and disclosure by
Harley-Davidson&reg; for the specific purpose(s) that the disclosure is made by you, unless
other legal bases are available under applicable law.</p>
<p>Providing Harley-Davidson&reg; with your personal information is always your choice. You
may withdraw your consent at any time; such withdrawal shall not affect the lawfulness of the
processing based on consent before its withdrawal. When you request products and/or services
from Harley-Davidson&reg;, utilize Harley-Davidson&reg;&rsquo;s services, or register with
any of Harley-Davidson&reg;&rsquo;s websites, Harley-Davidson&reg; asks that you provide
information that enables Harley-Davidson&reg; to respond to your request and/or provide you
with Harley-Davidson&reg;&rsquo;s products or services. In doing so, you understand that
Harley-Davidson&reg; may process your personal information as detailed in this Privacy
Notice.</p>
<p>Please note that, some processing of your personal information is necessary for the
functions of Harley-Davidson&reg;&rsquo;s websites, mobile app, or any products or services
purchased or subscribed to via our website or mobile app. If you decline to give us your
consent to such processing, we are not able to serve you with the corresponding functions.
Please contact Harley-Davidson&reg; using the contact information listed in the
&ldquo;<a href="${HD_PRIVACY_CONTACT}" target="_blank" rel="noopener noreferrer">How do I contact Harley-Davidson&reg;?</a>&rdquo;
section below if you wish to withdraw your consent to Harley-Davidson&reg;&rsquo;s
collection, use, or disclosure of your personal information as described in this Privacy
Notice. After withdrawing your consent, you will not be permitted to access or activate any
products / services purchased or subscribed to via our websites or mobile app that require
your consent in order for Harley-Davidson&reg; to provide the relevant product /
service.</p>

<h3>Electronic Communications</h3>
<p>Where applicable, we will seek your express consent to contact you, including by way of
commercial electronic messages. You can unsubscribe at any time from receiving commercial
electronic messages by following the instructions in such messages. Even if you have opted
out of receiving promotional communications from us, please be aware that we may still
contact you for other purposes. For example, we may contact you to provide communications you
have consented to receive, regarding the products or services we provide to you, or if you
contact us with an inquiry.</p>

<h2>How Does Harley-Davidson&reg; Use My Information?</h2>
<p>We will collect, use, disclose, and process personal information only where we have legal
basis to do so under the DPDP and other applicable legislations. Legal basis includes consent
(where you have given consent), contract (where processing is necessary for the performance
of a contract with you (e.g., to deliver the product or service you have requested)), legal
obligation and other legal bases allowed by applicable laws.</p>
<p>We may use your personal information in the following ways:</p>
<ul>
  <li>To personalize and enhance your experiences when you interact with Harley-Davidson&reg;</li>
  <li>To enable Harley-Davidson&reg; to provide you with the highest quality experiences, products, services and motorcycles</li>
  <li>To process and fulfill your orders and provide you with our services which includes sending you emails to confirm your order status and shipment</li>
  <li>To maintain transaction and other business records for legal, regulatory, and tax requirements</li>
  <li>To communicate with you and send you information by email, postal mail, telephone (including autodialed or pre-recorded call), text message, or other means about our products, services, contests, and promotions, unless you have directed us not to contact you with promotional communications</li>
  <li>To administer contests and promotions, and to respond to your requests and questions, and manage your complaints</li>
  <li>To help us learn more about your motorcycle and retail preferences</li>
  <li>To improve our understanding of your interests and concerns</li>
  <li>To help us manage and improve our websites, events, experiences, products and services</li>
  <li>To update you on membership programs, benefits and services, and to enhance your membership experience</li>
  <li>To authenticate you</li>
  <li>To perform market and demographic research</li>
  <li>To manage the possible adverse effect caused by our products or services in accordance with our legal obligations as a manufacturer</li>
  <li>To establish or exercise our legal rights or defend against any legal claims, or when necessary, to investigate, prevent, or respond to suspected illegal activities or fraud, or to protect the safety, rights, or property of you, us, or a third party</li>
  <li>To enhance your ownership experience and use of product or service</li>
  <li>To contact you if necessary, including by autodialed or pre-recorded call</li>
</ul>

<h3>Keeping Information Accurate / Access And Correction</h3>
<p>Having accurate information about you enables Harley-Davidson&reg; to give you better
service. You can help Harley-Davidson&reg; keep personal information up to date by keeping
Harley-Davidson&reg; informed of any changes, such as a change of address, telephone number
or any other circumstances.</p>
<p>Where required by law, you may have the right to access, verify and amend the information
Harley-Davidson&reg; has about you after Harley-Davidson&reg; has received your written
request and authenticated your identity.</p>
<p>In some situations, Harley-Davidson&reg; may not be able to provide access to certain
personal information as the right to access personal information is not absolute. If
Harley-Davidson&reg; does not provide you with the requested information, Harley-Davidson&reg;
will notify you in writing and explain Harley-Davidson&reg;&rsquo;s reason(s) for not
fulfilling your request.</p>
<p>Despite Harley-Davidson&reg;&rsquo;s efforts, errors sometimes do occur. If you identify
any personal information that is out-of-date, incorrect or incomplete, let Harley-Davidson&reg;
know and Harley-Davidson&reg; will make the corrections promptly and use every reasonable
effort to communicate these changes to other parties who may have inadvertently received
incorrect or out-of-date personal information from Harley-Davidson&reg;.</p>

<h3>Retention And Destruction Of Personal Information</h3>
<p>The amount of time Harley-Davidson&reg; will retain personal information varies, depending
on the services Harley-Davidson&reg; has provided, the nature of the personal information
that Harley-Davidson&reg; holds, as well as the basis and purposes for which it was collected
or processed. Harley-Davidson&reg; retains personal information for such period which will be
the minimum period necessary for Harley-Davidson&reg; to maintain sufficient information, so
that Harley-Davidson&reg; may respond to any issues that arise later or as is required by
law.</p>
<p>Legal requirements, however, may require us to retain some or all the personal information
we hold for a period that is longer than that for which we might otherwise hold.</p>
<p>When personal information is no longer required by Harley-Davidson&reg; or by law,
Harley-Davidson&reg; will either convert it into an aggregated non-identifying form or
Harley-Davidson&reg; will appropriately destroy or erase the personal information in a manner
that is in accordance with Harley-Davidson&reg;&rsquo;s current policies and procedures.</p>
<p>You control the choice of receiving marketing information or marketing calls. For
instructions on opting out, please see the section entitled, &ldquo;<a href="${HD_PRIVACY_OPT}" target="_blank" rel="noopener noreferrer">How do I Opt-In or Opt-Out of Promotional Communications?</a>&rdquo;</p>

<h2>How Does Harley-Davidson&reg; Use Cookies Or Tracking?</h2>
<p>Harley-Davidson&reg; and third-party companies we work with use tracking technologies
(including cookies and pixel tags) on our websites in order to provide tailored advertisements
on your behalf and on behalf of other advertisers across the Internet. Harley-Davidson&reg;
and these companies may collect information about your activity on our sites and other sites,
as well as your interaction with our advertising and other communications, and use this
information to determine which ads you see on websites and applications.</p>
<p>For more information on our use of cookies, click
<a href="https://www.harley-davidson.com/in/en/footer/utility/cookie-policy.html" target="_blank" rel="noopener noreferrer">[here]</a>.</p>

<h2>How Do I Access Or Change My Information?</h2>
<p>You can review, change, and make up-to-date certain personal information using one of our
online sites (such as on
<a href="https://www.harley-davidson.com/in/en/index.html" target="_blank" rel="noopener noreferrer">harley-davidson.com</a>).
To access your information at a Harley-Davidson&reg; website, simply sign into your account
using your email address and password, and you will be able to edit certain personal
information in your account profile.</p>
<p>You can also ask us for access to your personal information, to have it corrected or
updated or, to the extent allowed by applicable law, oppose our use of your personal
information by contacting us as described in the section entitled &ldquo;<a href="${HD_PRIVACY_CONTACT}" target="_blank" rel="noopener noreferrer">How do I contact Harley-Davidson&reg;?</a>&rdquo;.</p>

<h2>How Do I Make Choices About Receiving Promotional Communications?</h2>
<p>Harley-Davidson&reg; wants to communicate with you only if you want to hear from us. At
the time when we collect your personal information you will generally be offered a choice, in
compliance with applicable law, of whether you wish to receive promotional communications or
other electronic communications. If you elect not to receive such communications, we will not
process your data for marketing purposes. If at any point in the future you decide you prefer
not to receive promotional information such as information about special offers and marketing
events or other electronic communications, you can follow the process below.</p>

<h2>How Do I Opt-In Or Opt-Out Of Promotional Communications?</h2>
<p>If you change your mind about your current communication preferences with
Harley-Davidson&reg;, you can use the unsubscribe feature in a marketing email or log into
your online profile account via our website or mobile app to change your preferences and
consents. You can also contact our customer service team via phone or mail as described in
the section entitled &ldquo;<a href="${HD_PRIVACY_CONTACT}" target="_blank" rel="noopener noreferrer">How do I contact Harley-Davidson&reg;?</a>&rdquo;.</p>
<p>We are required by law to provide motorcycle owners with warranty and recall information.
Please note that when you make a business transaction with us (for example, renew HOG or
Museum membership or purchase a product or subscribe to a service online) we will confirm
your order or subscription status (and any related shipment) by email. We may also need to
contact you via telephone, email (in accordance with applicable laws) or postal mail or
notification via the mobile app with questions or information regarding your order or
subscription. Opt outs are entity specific. Opting out with respect to one entity is not
automatically effective with respect to the others. For example, opting out for
Harley-Davidson&reg; Motor Company does not opt you out for Harley-Davidson&reg; Financial
Services.</p>
<p>If you ask to no longer receive promotional communications or other electronic
communications from us, we will mark your information as &ldquo;do not market&rdquo; and take
steps to honor your request in accordance with applicable laws.</p>

<h2>Does This Govern My Communications With Harley-Davidson&reg; Dealers?</h2>
<p>Harley-Davidson&reg; dealers are independent entities. Dealers may share certain
information with us in connection with your purchase of a Harley-Davidson&reg; vehicle.
However, this notice does not apply to them or your communications with them. To change your
privacy preferences with a Harley-Davidson&reg; dealer, please contact the dealer
directly.</p>

<h2>How Does Harley-Davidson&reg; Protect My Personal Information?</h2>
<p>Harley-Davidson&reg; will provide an adequate level of protection for the personal
information and make sure that appropriate technical and organizational security measures are
in place to protect the personal information against accidental or unlawful destruction,
accidental loss or alteration, unauthorized disclosure or access, and against all other
unlawful forms of processing. In the event of a personal information breach, we will comply
with applicable measures as required under applicable law.</p>
<p>Our website may include links to other websites whose content is not under our control,
therefore we do not assume or accept any responsibility for the content of these websites,
nor are responsible for the information protection strategies of other web pages or their
content.</p>

<h2>How Does Harley-Davidson&reg; Protect Children&rsquo;s Privacy?</h2>
<p>Our websites and mobile app are not directed to children. We do not knowingly collect
personally identifiable information from children without permission from a parent or legal
representative, unless permitted by applicable law.</p>
<p>You must be at least 18 years old to provide us with your personal information, to engage
in transactions on our store or websites, or mobile app. By engaging in transactions with us,
you affirm that you are at least 18 years old and are fully able to enter into and be legally
bound by such transactions.</p>
<p>If we are notified or learn that a minor below 18 years old has submitted personal data
to us through our media or otherwise, we will delete such personal information.</p>

<h2>How Do I Know My Personal Information Is Secure?</h2>
<p>Harley-Davidson&reg; may hold your personal information in paper and/or electronic form.
Harley-Davidson&reg; maintains physical, electronic, contractual, procedural and managerial
safeguards to protect the confidentiality, integrity, security, and privacy of your personal
information. We use Secure Sockets Layer (SSL) technology to protect your information as it
is transmitted to us. We also employ user authentication procedures and other preventative
technologies designed to keep your data secure and protected. Access to personal information
stored by Harley-Davidson&reg; is limited to authorized Harley-Davidson&reg; personnel who
require access to perform their job functions, and to authorized third parties that are
contractually required to keep your information confidential and secure. Please note,
however, that no data transmission or storage can be guaranteed to be 100% secure. As a
result, while we strive to protect the information we maintain, we cannot ensure or warrant
the security of any information that you transmit to us.</p>
<p>You are responsible for taking all reasonable steps to protect your Customer Account ID
and password. Please store these in a safe location and do not share them with any third
party.</p>

<h2>What About Links To Other Websites?</h2>
<p>For your convenience, our websites and mobile app may contain links to other companies&rsquo;
sites such as authorized Harley-Davidson&reg; dealers, which may have privacy notices that
differ from our own. We do not endorse and are not responsible for the content or practices
of any linked sites. We recommend that you review the privacy notice of any site that you
access through a link from our websites or our mobile app.</p>

<h2>How Am I Updated About Changes To The Harley-Davidson&reg; Privacy Notice?</h2>
<p>As Harley-Davidson&reg; business or outside business conditions change, we may update our
Privacy Notice to reflect changes in our practices. We will post a revised Privacy Notice on
our website as needed due to changes in our practices or as otherwise legally required.</p>

<h2>Who Do I Contact With Questions On The Privacy Notice?</h2>
<p>For questions or concerns specific to our Privacy Notice and its application or complaints
about our handling of your information, send your question, concern or complaint using the
contact information listed in the &ldquo;<a href="${HD_PRIVACY_CONTACT}" target="_blank" rel="noopener noreferrer">How do I contact Harley-Davidson&reg;?</a>&rdquo;
section below. If you are not satisfied with our response, you always have rights to lodge a
complaint with relevant competent authorities.</p>

<h2>Your Privacy Rights Under The India DPDP</h2>
<p>Pursuant to applicable data protection laws you have certain rights with respect to the
personal information that we process about you.</p>
<ul>
  <li><strong>Right to withdraw consent:</strong> If you have consented to a personal information processing activity, you can withdraw this consent at any time for future processing. Such withdrawal will not affect the lawfulness of the processing prior to consent being withdrawn. If you have provided your consent to receiving direct marketing from us or any third parties and would like to withdraw such consent, please consult the following section for detailed information on how to do so.</li>
  <li><strong>Right of access and copy:</strong> You may have the right to obtain from us confirmation as to whether or not personal information concerning you is processed, and, where that is the case, to request access to, and copy of, the personal information.</li>
  <li><strong>Right to rectification:</strong> You may have the right to obtain from us the rectification of inaccurate personal information about you. Depending on the purposes of the processing, you may have the right to have incomplete personal information completed, including by means of providing a supplementary statement.</li>
  <li><strong>Right to erasure:</strong> Under certain circumstances, you may have the right to obtain from us the erasure of personal information about you and we may be obliged to erase such personal information.</li>
  <li><strong>Right to restriction of processing:</strong> Under certain circumstances, you may have the right to obtain from us restriction of processing your personal information. In this case, the respective information will be marked and may only be processed by us for certain purposes.</li>
</ul>

<h2>Exercising Your Rights</h2>
<p>To exercise the right to Consumer Rights under the India DPDP, you may submit a request
by:</p>
<ul>
  <li><strong>Online at:</strong> <a href="https://submit-irm.trustarc.com/services/validation/7065b8e2-638c-44e3-9be8-1f9a741ddb44" target="_blank" rel="noopener noreferrer">Data Privacy Request Form</a></li>
  <li><strong>By email:</strong> <a href="mailto:DataPrivacy@Harley-Davidson.com">DataPrivacy@Harley-Davidson&reg;.com</a></li>
  <li><strong>By Phone:</strong> <a href="tel:1-800-258-2464">1-800-258-2464</a></li>
</ul>
<p>Please include your name, address, email address, and phone number in your request. In
order to complete your request, you will be required to respond to any follow-up inquires we
may make, and we may deny your request if you do not do so. We will not discriminate against
any consumer for exercising these rights, as described further below.</p>

<h2>How Do I Contact Harley-Davidson&reg;?</h2>
<p>To change selections about receiving promotional communications, to update your personal
information, to ask questions about this Privacy Notice and our handling of your personal
information, or to exercise your privacy rights, you can contact Harley-Davidson&reg; by
email, telephone, or postal mail. We will review and respond within 15 working days after
verifying your identity, during which period you may continue to receive communications from
Harley-Davidson&reg;. We will explain to you within 15 working days if there is any
complicated situation that requires extension.</p>
<p>If contacting us by postal mail, please include your name and the email address or street
address you used when you provided your information to Harley-Davidson&reg;.</p>
<ul>
  <li><strong>Email:</strong> <a href="mailto:DataPrivacy@Harley-Davidson.com">DataPrivacy@Harley-Davidson&reg;.com</a></li>
  <li><strong>Customer Care via phone:</strong> <a href="tel:1-800-258-2464">1-800-258-2464</a></li>
  <li><strong>Regular Mail:</strong> Attn: Chief Privacy Officer, 3700 W. Juneau Avenue, Milwaukee, WI 53208</li>
</ul>
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
  const isPrivacy = contentKey === 'privacy';
  // QA latest: legal-page hero pattern — solid black banner, no
  // scenic photo, breadcrumb above headline. Applies to cookies +
  // privacy (terms will land here too when its copy is published).
  const isLegal = isCookies || isPrivacy;

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
      : isPrivacy && isMissing
      ? DOMPurify.sanitize(PRIVACY_FALLBACK_HTML, {
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
        solidBlack={isLegal}
        // QA latest: HOME / COOKIE on cookies page, HOME / PRIVACY &
        // POLICY on the Privacy page, HOME / ABOUT US on the About
        // page — current segment in orange per Figma.
        breadcrumbs={
          isCookies
            ? [{ label: 'Home', to: '/' }, { label: 'Cookie' }]
            : isPrivacy
            ? [{ label: 'Home', to: '/' }, { label: 'Privacy & Policy' }]
            : isAbout
            ? [{ label: 'Home', to: '/' }, { label: 'About Us' }]
            : undefined
        }
        subtitle={
          isCookies
            ? 'Cookie Notice as of October 2020'
            : isPrivacy
            ? 'Privacy Notice as of October 2020'
            : undefined
        }
      />
      <div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
        {isLoading && <div className="text-gray-600">Loading…</div>}
        {isMissing && !isCookies && !isAbout && !isPrivacy && (
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
                isLegal
                  ? '[&_h2]:text-[24px] [&_h2]:!text-[#1A1A1A] [&_h3]:text-[18px] [&_h3_a]:!text-[#1A1A1A] [&_h3_a]:hover:!text-hd-orange [&_h3_a]:!no-underline'
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
