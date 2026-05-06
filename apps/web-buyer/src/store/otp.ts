import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// PRD §6.1.4 AC2 — once verified in a session, do not re-prompt for the same phone.
// We store the verified token + the phone/name/email it was issued for so the
// "alreadyVerified" shortcut on listing pages can submit a real lead with the
// buyer's actual identity instead of synthesised placeholders. Token has a
// 15-min TTL on the server, so it auto-expires; we also clear it on
// logout-equivalent actions.

export type OtpPurpose = 'ENQUIRY' | 'TRADE_IN';

interface OtpProfile {
  phone: string;
  name?: string;
  email?: string;
}

interface OtpState {
  verifiedToken: string | null;
  verifiedFor: OtpPurpose | null;
  phone: string | null;
  /** Full name as the buyer typed it on the verification step. Persisted so a
      second-listing enquiry within the same session doesn't re-ask. */
  name: string | null;
  /** Email same as above — required by the leads API even on the shortcut path. */
  email: string | null;
  set: (token: string, profile: OtpProfile, purpose: OtpPurpose) => void;
  clear: () => void;
}

export const useOtpStore = create<OtpState>()(
  persist(
    (set) => ({
      verifiedToken: null,
      verifiedFor: null,
      phone: null,
      name: null,
      email: null,
      set: (token, profile, purpose) =>
        set({
          verifiedToken: token,
          verifiedFor: purpose,
          phone: profile.phone,
          name: profile.name ?? null,
          email: profile.email ?? null,
        }),
      clear: () =>
        set({
          verifiedToken: null,
          verifiedFor: null,
          phone: null,
          name: null,
          email: null,
        }),
    }),
    { name: 'hd-cpo-buyer-otp' },
  ),
);
