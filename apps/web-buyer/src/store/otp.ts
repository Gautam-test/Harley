import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// PRD §6.1.4 AC2 — once verified in a session, do not re-prompt for the same phone.
// We store the verified token + the phone it was issued for. Token has a 15-min TTL
// on the server, so it auto-expires; we also clear it on logout-equivalent actions.

export type OtpPurpose = 'ENQUIRY' | 'GENERAL_LEAD' | 'TRADE_IN';

interface OtpState {
  verifiedToken: string | null;
  verifiedFor: OtpPurpose | null;
  phone: string | null;
  set: (token: string, phone: string, purpose: OtpPurpose) => void;
  clear: () => void;
}

export const useOtpStore = create<OtpState>()(
  persist(
    (set) => ({
      verifiedToken: null,
      verifiedFor: null,
      phone: null,
      set: (token, phone, purpose) =>
        set({ verifiedToken: token, verifiedFor: purpose, phone }),
      clear: () => set({ verifiedToken: null, verifiedFor: null, phone: null }),
    }),
    { name: 'hd-cpo-buyer-otp' },
  ),
);
