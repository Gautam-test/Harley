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
  // Palette:
  //   #000000  black border + headings
  //   #FF6600  H-D orange (underline bar, accent, star fill)
  //   #E8EAF8  light blue/lavender row highlight
  //   #D4AF37  gold (seal)
  //   #B8860B  dark gold (seal stroke + curved text)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 640" width="900" height="640" font-family="Helvetica, Arial, sans-serif">
  <!-- White background -->
  <rect width="900" height="640" fill="#ffffff"/>
  <!-- Thick black outer border -->
  <rect x="8" y="8" width="884" height="624" fill="none" stroke="#000000" stroke-width="8"/>

  <!-- ── TOP LEFT BLOCK ── -->
  <!-- H–D CERTIFIED heading in bold black with small orange ™ -->
  <text x="40" y="70" font-size="42" font-weight="bold" fill="#000000" letter-spacing="2">H–D CERTIFIED</text>
  <text x="338" y="48" font-size="14" font-weight="bold" fill="#FF6600">&#x2122;</text>
  <!-- PRE-OWNED HARLEY-DAVIDSON® subtitle -->
  <text x="40" y="92" font-size="14" font-weight="bold" fill="#000000" letter-spacing="1.5">PRE-OWNED HARLEY-DAVIDSON&#xAE;</text>
  <!-- Orange underline bar below subtitle -->
  <rect x="40" y="100" width="160" height="5" fill="#FF6600"/>

  <!-- ── TOP RIGHT: GOLD SEAL ── -->
  <defs>
    <path id="sealTopArc" d="M 720,115 A 65,65 0 0,1 850,115"/>
    <path id="sealBottomArc" d="M 720,115 A 65,65 1 0,0 850,115"/>
  </defs>
  <!-- Outer gold ring -->
  <circle cx="785" cy="115" r="70" fill="#D4AF37" stroke="#8B6914" stroke-width="2"/>
  <!-- Inner gold ring (lighter) -->
  <circle cx="785" cy="115" r="58" fill="#F5D76E" stroke="#8B6914" stroke-width="1"/>
  <!-- Curved text along top arc -->
  <text font-size="8.5" font-weight="bold" fill="#5C4A00" letter-spacing="1.5">
    <textPath href="#sealTopArc" startOffset="8%">12 MONTH GUARANTEE</textPath>
  </text>
  <!-- Curved text along bottom arc -->
  <text font-size="8.5" font-weight="bold" fill="#5C4A00" letter-spacing="1.5">
    <textPath href="#sealBottomArc" startOffset="8%">&amp; ROADSIDE ASSISTANCE</textPath>
  </text>
  <!-- Bar & Shield logo (simplified) -->
  <!-- Shield body -->
  <path d="M785,82 L808,92 L808,118 Q808,138 785,148 Q762,138 762,118 L762,92 Z" fill="#1a1a1a" stroke="#000000" stroke-width="1"/>
  <!-- Bar across shield -->
  <rect x="762" y="108" width="46" height="12" fill="#FF6600"/>
  <!-- H-D wordmark on bar -->
  <text x="785" y="118" font-size="9" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">H-D</text>
  <!-- MOTOR / CYCLES text above/below bar -->
  <text x="785" y="103" font-size="6" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">MOTOR</text>
  <text x="785" y="132" font-size="6" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">CYCLES</text>

  <!-- ── BODY CERTIFICATION PARAGRAPH ── -->
  <text x="40" y="150" font-size="13" fill="#222222" xml:space="preserve">This is to certify that the following motorcycle has been thoroughly</text>
  <text x="40" y="170" font-size="13" fill="#222222" xml:space="preserve">inspected and reconditioned by a qualified H-D&#xAE; technician and is</text>
  <text x="40" y="190" font-size="13" fill="#222222" xml:space="preserve">backed by a comprehensive minimum 12 month guarantee.</text>

  <!-- ── MODEL ROW ── (light blue/lavender highlight) -->
  <rect x="40" y="215" width="820" height="56" fill="#E8EAF8"/>
  <text x="56" y="237" font-size="12" font-weight="bold" fill="#000000" letter-spacing="2">MODEL:</text>
  <text x="56" y="262" font-size="24" font-weight="bold" fill="#000000" letter-spacing="1">${bikeLabel}</text>

  <!-- ── REGISTRATION ROW ── (light blue/lavender highlight) -->
  <rect x="40" y="280" width="820" height="56" fill="#E8EAF8"/>
  <text x="56" y="302" font-size="12" font-weight="bold" fill="#000000" letter-spacing="2">REGISTRATION:</text>
  <text x="56" y="327" font-size="24" font-weight="bold" fill="#000000" letter-spacing="1">${reg}</text>

  <!-- ── FEATURES HEADER ── -->
  <text x="40" y="370" font-size="14" font-weight="bold" fill="#000000" letter-spacing="2">FEATURES OF THIS CERTIFIED MACHINE</text>

  <!-- Four bullet rows — orange circle with white star ★ -->
  <!-- Row 1 left -->
  <circle cx="52" cy="397" r="11" fill="#FF6600"/>
  <text x="52" y="402" font-size="14" font-weight="bold" fill="#ffffff" text-anchor="middle">&#x2605;</text>
  <text x="72" y="402" font-size="12" font-weight="bold" fill="#000000" letter-spacing="1">12 MONTHS ROADSIDE ASSISTANCE</text>
  <!-- Row 1 right -->
  <circle cx="462" cy="397" r="11" fill="#FF6600"/>
  <text x="462" y="402" font-size="14" font-weight="bold" fill="#ffffff" text-anchor="middle">&#x2605;</text>
  <text x="482" y="402" font-size="12" font-weight="bold" fill="#000000" letter-spacing="1">COMPREHENSIVE 12 MONTH GUARANTEE</text>

  <!-- Row 2 left -->
  <circle cx="52" cy="432" r="11" fill="#FF6600"/>
  <text x="52" y="437" font-size="14" font-weight="bold" fill="#ffffff" text-anchor="middle">&#x2605;</text>
  <text x="72" y="437" font-size="12" font-weight="bold" fill="#000000" letter-spacing="1">110-POINT QUALITY ASSURANCE INSPECTION</text>
  <!-- Row 2 right -->
  <circle cx="462" cy="432" r="11" fill="#FF6600"/>
  <text x="462" y="437" font-size="14" font-weight="bold" fill="#ffffff" text-anchor="middle">&#x2605;</text>
  <text x="482" y="437" font-size="12" font-weight="bold" fill="#000000" letter-spacing="1">ACCESS TO H.O.G.&#xAE; MEMBERSHIP</text>

  <!-- ── BOTTOM ROW: INSPECTED BY | CERTIFIED ON ── (light blue/lavender highlight) -->
  <rect x="40" y="475" width="820" height="56" fill="#E8EAF8"/>
  <text x="56" y="497" font-size="12" font-weight="bold" fill="#000000" letter-spacing="2">INSPECTED BY:</text>
  <text x="56" y="521" font-size="18" font-weight="bold" fill="#000000">${by}</text>

  <!-- Vertical divider between columns -->
  <line x1="460" y1="485" x2="460" y2="521" stroke="#999999" stroke-width="1"/>

  <text x="476" y="497" font-size="12" font-weight="bold" fill="#000000" letter-spacing="2">CERTIFIED ON:</text>
  <text x="476" y="521" font-size="18" font-weight="bold" fill="#000000">${on}</text>

  <!-- Fine print -->
  <text x="450" y="565" font-size="9" fill="#888888" text-anchor="middle">H-D CERTIFIED&#x2122; · PRE-OWNED HARLEY-DAVIDSON&#xAE; · 12-MONTH GUARANTEE</text>
  <text x="450" y="580" font-size="9" fill="#888888" text-anchor="middle">This certificate is issued by an authorised Harley-Davidson dealer.</text>
</svg>`;
}
