import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

// DPDP Act 2023 minimum-compliance cookie banner.
// Stores consent in localStorage; revisits within 180 days are silent.
// PRD Open Question 15 — final policy text + categorisation should land before
// production go-live. The banner is intentionally simple ("Accept" / "Necessary
// only") because the marketplace runs first-party only at v1 — no ad/analytics
// pixels yet. When marketing tags are added, swap this for a category dialog.
const STORAGE_KEY = 'hd-cookie-consent-v1';
const TTL_DAYS = 180;

type Choice = 'all' | 'necessary';
interface Consent {
  choice: Choice;
  acceptedAt: number;
}

function loadConsent(): Consent | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Consent;
    if (Date.now() - parsed.acceptedAt > TTL_DAYS * 24 * 60 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveConsent(choice: Choice) {
  const c: Consent = { choice, acceptedAt: Date.now() };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* private mode or quota — banner will reappear next visit, acceptable */
  }
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!loadConsent()) setVisible(true);
  }, []);

  if (!visible) return null;

  const accept = (choice: Choice) => {
    saveConsent(choice);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className="fixed bottom-0 inset-x-0 z-50 bg-hd-black text-hd-white border-t-2 border-hd-orange shadow-2xl"
    >
      <div className="max-w-container mx-auto px-6 py-4 grid lg:grid-cols-[1fr_auto] gap-4 items-center">
        <div className="text-sm leading-relaxed">
          <p className="font-subhead uppercase tracking-subhead text-hd-orange text-xs">
            We value your privacy
          </p>
          <p className="mt-1 text-gray-200">
            We use cookies that are essential for the site to work (login, OTP, enquiry routing).
            With your consent we may also use cookies to improve the experience. Read our{' '}
            <Link to="/privacy" className="text-hd-orange hover:underline">
              Privacy Policy
            </Link>{' '}
            and{' '}
            <Link to="/terms" className="text-hd-orange hover:underline">
              Terms
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={() => accept('necessary')}
            className="border border-gray-500 text-hd-white font-subhead uppercase tracking-subhead text-xs px-4 py-2.5 hover:border-hd-white transition rounded-card whitespace-nowrap"
          >
            Necessary only
          </button>
          <button
            type="button"
            onClick={() => accept('all')}
            className="bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead text-xs px-4 py-2.5 hover:brightness-110 transition rounded-card whitespace-nowrap"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
