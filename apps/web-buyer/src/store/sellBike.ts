import { create } from 'zustand';

// Lightweight global toggle for the Sell-Bike modal. The header's "Sell Your
// Bike" link calls openSellBike() instead of navigating to a route, so the
// trade-in form is reachable from any page (Figma /Customer/Frame 28.png
// shows it as a popup, not a standalone screen).
interface SellBikeState {
  open: boolean;
  openSellBike: () => void;
  closeSellBike: () => void;
}

export const useSellBikeStore = create<SellBikeState>((set) => ({
  open: false,
  openSellBike: () => set({ open: true }),
  closeSellBike: () => set({ open: false }),
}));
