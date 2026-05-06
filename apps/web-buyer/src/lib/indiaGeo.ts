// Static India geography reference for the Buyer Enquiry form.
// State list = 28 states + 8 union territories (post-2019 reorganisation,
// matches the official Census + DPDP-compliant address grammar).
// Cities per state = the H-D-relevant metros and tier-1/2 cities that have
// either an authorised dealership or sit in a dealer's catchment radius.
//
// Keep additions here narrow: the dropdown is meant to discover the right
// dealer routing, not be a full Indian gazetteer. Add a city only when a
// dealer's reach actually extends there.

export interface StateGeo {
  /** Display label — used as the form value too, so it survives across re-renders. */
  state: string;
  /** Sorted alphabetically for in-dropdown findability. */
  cities: string[];
}

export const INDIA_GEO: StateGeo[] = [
  {
    state: 'Andhra Pradesh',
    cities: ['Guntur', 'Tirupati', 'Vijayawada', 'Visakhapatnam'],
  },
  { state: 'Arunachal Pradesh', cities: ['Itanagar'] },
  { state: 'Assam', cities: ['Dibrugarh', 'Guwahati', 'Silchar'] },
  { state: 'Bihar', cities: ['Bhagalpur', 'Gaya', 'Muzaffarpur', 'Patna'] },
  { state: 'Chhattisgarh', cities: ['Bhilai', 'Bilaspur', 'Raipur'] },
  { state: 'Goa', cities: ['Panaji', 'Vasco da Gama'] },
  {
    state: 'Gujarat',
    cities: ['Ahmedabad', 'Gandhinagar', 'Rajkot', 'Surat', 'Vadodara'],
  },
  {
    state: 'Haryana',
    cities: ['Faridabad', 'Gurgaon', 'Karnal', 'Panipat', 'Sonipat'],
  },
  { state: 'Himachal Pradesh', cities: ['Dharamshala', 'Shimla'] },
  { state: 'Jharkhand', cities: ['Dhanbad', 'Jamshedpur', 'Ranchi'] },
  {
    state: 'Karnataka',
    cities: ['Bengaluru', 'Hubli', 'Mangaluru', 'Mysuru'],
  },
  {
    state: 'Kerala',
    cities: ['Kochi', 'Kozhikode', 'Thiruvananthapuram', 'Thrissur'],
  },
  {
    state: 'Madhya Pradesh',
    cities: ['Bhopal', 'Gwalior', 'Indore', 'Jabalpur'],
  },
  {
    state: 'Maharashtra',
    cities: ['Aurangabad', 'Mumbai', 'Nagpur', 'Nashik', 'Pune', 'Thane'],
  },
  { state: 'Manipur', cities: ['Imphal'] },
  { state: 'Meghalaya', cities: ['Shillong'] },
  { state: 'Mizoram', cities: ['Aizawl'] },
  { state: 'Nagaland', cities: ['Kohima', 'Dimapur'] },
  { state: 'Odisha', cities: ['Bhubaneswar', 'Cuttack', 'Rourkela'] },
  { state: 'Punjab', cities: ['Amritsar', 'Jalandhar', 'Ludhiana', 'Mohali'] },
  {
    state: 'Rajasthan',
    cities: ['Ajmer', 'Jaipur', 'Jodhpur', 'Kota', 'Udaipur'],
  },
  { state: 'Sikkim', cities: ['Gangtok'] },
  {
    state: 'Tamil Nadu',
    cities: ['Chennai', 'Coimbatore', 'Madurai', 'Salem', 'Tiruchirappalli'],
  },
  { state: 'Telangana', cities: ['Hyderabad', 'Nizamabad', 'Warangal'] },
  { state: 'Tripura', cities: ['Agartala'] },
  {
    state: 'Uttar Pradesh',
    cities: [
      'Agra',
      'Allahabad',
      'Ghaziabad',
      'Kanpur',
      'Lucknow',
      'Noida',
      'Varanasi',
    ],
  },
  { state: 'Uttarakhand', cities: ['Dehradun', 'Haridwar'] },
  {
    state: 'West Bengal',
    cities: ['Asansol', 'Durgapur', 'Howrah', 'Kolkata', 'Siliguri'],
  },
  // ─── Union Territories ─────────────────────────────────────────
  { state: 'Andaman & Nicobar Islands', cities: ['Port Blair'] },
  { state: 'Chandigarh', cities: ['Chandigarh'] },
  {
    state: 'Dadra & Nagar Haveli and Daman & Diu',
    cities: ['Daman', 'Silvassa'],
  },
  {
    state: 'Delhi',
    cities: [
      'Central Delhi',
      'East Delhi',
      'New Delhi',
      'North Delhi',
      'South Delhi',
      'West Delhi',
    ],
  },
  { state: 'Jammu & Kashmir', cities: ['Jammu', 'Srinagar'] },
  { state: 'Ladakh', cities: ['Leh'] },
  { state: 'Lakshadweep', cities: ['Kavaratti'] },
  { state: 'Puducherry', cities: ['Puducherry'] },
];

/** Flat alphabetical list of just the state names — convenient for dropdowns. */
export const INDIA_STATES: string[] = INDIA_GEO.map((s) => s.state);

/** Look up the city options for a given state. Returns empty when state is blank. */
export function citiesForState(state: string): string[] {
  if (!state) return [];
  return INDIA_GEO.find((s) => s.state === state)?.cities ?? [];
}
