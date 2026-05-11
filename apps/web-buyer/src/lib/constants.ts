// Buyer-site shared constants. Keeps URLs / phone numbers in one place so the
// freeze-design copy doesn't drift when reused across components.

// HOG (Harley Owners Group) — the .in (India) page on harley-davidson.com
// genuinely 404s right now (verified Nov 2026), so the CTA was sending
// buyers to a "We're sorry" error page (QA bug 1). hog.com is the
// canonical HOG site, lives outside the regional .com tree, and answers
// 200 — point the CTA there until H-D restores the India-specific page.
export const HOG_BENEFITS_URL = 'https://www.hog.com/';
