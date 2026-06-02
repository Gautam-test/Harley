// Certificate SVG generator — produces the H-D Certified certificate
// matching the design spec: white background, thick black border,
// H-D CERTIFIED heading, gold seal, body text, and dynamic fields.
//
// Returns null when any of the three required dynamic fields is missing
// (registrationNumber, inspectedBy, certifiedOn) — the route turns that
// into a 404 so the buyer never sees a blank certificate.

export interface CertificateFields {
  modelName: string;
  modelFamily: string;
  registrationNumber: string | null | undefined;
  inspectedBy: string | null | undefined;
  certifiedOn: Date | null | undefined;
}

function fmt(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const y = date.getFullYear();
  return `${m}/${d}/${y}`;
}

// Escape special XML chars for use in SVG text elements.
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generateCertificateSvg(fields: CertificateFields): string | null {
  const { modelName, modelFamily, registrationNumber, inspectedBy, certifiedOn } = fields;

  // All three dynamic fields must be present.
  if (!registrationNumber || !inspectedBy || !certifiedOn) return null;

  const bikeLabel = esc(`${modelName} ${modelFamily}`);
  const reg = esc(registrationNumber);
  const by = esc(inspectedBy);
  const on = esc(fmt(certifiedOn));

  // Viewbox: 900 × 640.  All coordinates are in px units.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 640" width="900" height="640" font-family="Helvetica, Arial, sans-serif">
  <!-- White background -->
  <rect width="900" height="640" fill="#ffffff"/>
  <!-- Thick outer border -->
  <rect x="6" y="6" width="888" height="628" fill="none" stroke="#000000" stroke-width="6"/>
  <!-- Thin inner border -->
  <rect x="14" y="14" width="872" height="612" fill="none" stroke="#000000" stroke-width="1.5"/>

  <!-- ── TOP LEFT BLOCK ── -->
  <!-- H–D CERTIFIED™ heading -->
  <text x="38" y="62" font-size="34" font-weight="bold" fill="#FF6600" letter-spacing="2">H–D CERTIFIED&#x2122;</text>
  <!-- PRE-OWNED HARLEY-DAVIDSON® subtitle -->
  <text x="38" y="84" font-size="13" font-weight="normal" fill="#111111" letter-spacing="1">PRE-OWNED HARLEY-DAVIDSON&#xAE;</text>
  <!-- Orange underline below subtitle -->
  <rect x="38" y="91" width="320" height="3" fill="#FF6600"/>

  <!-- ── TOP RIGHT: GOLD SEAL ── -->
  <!-- Outer gold ring -->
  <circle cx="780" cy="100" r="84" fill="none" stroke="#C9A800" stroke-width="3"/>
  <!-- Inner gold ring -->
  <circle cx="780" cy="100" r="76" fill="none" stroke="#C9A800" stroke-width="1.5"/>
  <!-- Gold fill background for seal -->
  <circle cx="780" cy="100" r="73" fill="#FFF8DC"/>

  <!-- Bar & Shield icon (simplified) -->
  <!-- Shield shape -->
  <path d="M780,52 L800,62 L800,90 Q800,112 780,122 Q760,112 760,90 L760,62 Z" fill="#C9A800" stroke="#8B6914" stroke-width="1.5"/>
  <!-- Bar across shield -->
  <rect x="760" y="76" width="40" height="10" fill="#111111"/>
  <!-- H-D text on shield -->
  <text x="780" y="100" font-size="9" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="1">H-D</text>

  <!-- Circular text path for seal label -->
  <defs>
    <path id="sealTopArc" d="M 720,100 A 60,60 0 0,1 840,100"/>
    <path id="sealBottomArc" d="M 840,100 A 60,60 0 0,1 720,100"/>
  </defs>
  <text font-size="9.5" font-weight="bold" fill="#8B6914" letter-spacing="2.5">
    <textPath href="#sealTopArc" startOffset="5%">12 MONTH GUARANTEE</textPath>
  </text>
  <text font-size="9.5" font-weight="bold" fill="#8B6914" letter-spacing="2.5">
    <textPath href="#sealBottomArc" startOffset="3%">&amp; ROADSIDE ASSISTANCE</textPath>
  </text>

  <!-- ── BODY TEXT ── -->
  <text x="38" y="130" font-size="12" fill="#333333" xml:space="preserve">This is to certify that the following motorcycle has been thoroughly</text>
  <text x="38" y="147" font-size="12" fill="#333333" xml:space="preserve">inspected and reconditioned by a qualified H-D&#xAE; technician and is</text>
  <text x="38" y="164" font-size="12" fill="#333333" xml:space="preserve">backed by a comprehensive minimum 12 month guarantee.</text>

  <!-- Divider -->
  <line x1="38" y1="178" x2="862" y2="178" stroke="#cccccc" stroke-width="1"/>

  <!-- MODEL label + value -->
  <text x="38" y="210" font-size="11" font-weight="bold" fill="#FF6600" letter-spacing="2">MODEL:</text>
  <text x="38" y="240" font-size="28" font-weight="bold" fill="#111111" letter-spacing="1">${bikeLabel}</text>

  <!-- REGISTRATION label + value -->
  <text x="38" y="278" font-size="11" font-weight="bold" fill="#FF6600" letter-spacing="2">REGISTRATION:</text>
  <text x="38" y="308" font-size="28" font-weight="bold" fill="#111111" letter-spacing="1">${reg}</text>

  <!-- Section divider -->
  <line x1="38" y1="322" x2="862" y2="322" stroke="#cccccc" stroke-width="1"/>

  <!-- FEATURES header -->
  <text x="38" y="346" font-size="12" font-weight="bold" fill="#111111" letter-spacing="3">FEATURES OF THIS CERTIFIED MACHINE</text>

  <!-- Four bullet rows — orange star ★ + feature text -->
  <!-- Row 1 -->
  <text x="38" y="376" font-size="14" fill="#FF6600">&#x2605;</text>
  <text x="58" y="376" font-size="12" font-weight="bold" fill="#111111" letter-spacing="1">12 MONTHS ROADSIDE ASSISTANCE</text>
  <text x="430" y="376" font-size="14" fill="#FF6600">&#x2605;</text>
  <text x="450" y="376" font-size="12" font-weight="bold" fill="#111111" letter-spacing="1">COMPREHENSIVE 12 MONTH GUARANTEE</text>

  <!-- Row 2 -->
  <text x="38" y="406" font-size="14" fill="#FF6600">&#x2605;</text>
  <text x="58" y="406" font-size="12" font-weight="bold" fill="#111111" letter-spacing="1">110-POINT QUALITY ASSURANCE INSPECTION</text>
  <text x="430" y="406" font-size="14" fill="#FF6600">&#x2605;</text>
  <text x="450" y="406" font-size="12" font-weight="bold" fill="#111111" letter-spacing="1">ACCESS TO H.O.G.&#xAE; MEMBERSHIP</text>

  <!-- Section divider -->
  <line x1="38" y1="428" x2="862" y2="428" stroke="#cccccc" stroke-width="1"/>

  <!-- Bottom row: INSPECTED BY | CERTIFIED ON -->
  <text x="38" y="458" font-size="10" font-weight="bold" fill="#FF6600" letter-spacing="2">INSPECTED BY:</text>
  <text x="38" y="478" font-size="16" font-weight="bold" fill="#111111">${by}</text>

  <line x1="450" y1="428" x2="450" y2="500" stroke="#cccccc" stroke-width="1"/>

  <text x="470" y="458" font-size="10" font-weight="bold" fill="#FF6600" letter-spacing="2">CERTIFIED ON:</text>
  <text x="470" y="478" font-size="16" font-weight="bold" fill="#111111">${on}</text>

  <!-- Bottom border accent line -->
  <rect x="38" y="510" width="824" height="3" fill="#FF6600"/>

  <!-- Fine print -->
  <text x="450" y="535" font-size="9" fill="#888888" text-anchor="middle">H-D CERTIFIED™ · PRE-OWNED HARLEY-DAVIDSON® · 12-MONTH GUARANTEE</text>
  <text x="450" y="550" font-size="9" fill="#888888" text-anchor="middle">This certificate is issued by an authorised Harley-Davidson dealer.</text>
</svg>`;
}
