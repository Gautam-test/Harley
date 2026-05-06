# UAT Plan — H-D CPO Marketplace v1

**Owner:** Vendor (engineering) → Client (acceptance)
**Duration:** 5 business days (suggested)
**Environment:** Staging (to be provisioned by client per HANDOVER §3)
**Source-of-truth specification:** `PRD_HarleyDavidson_CPO_Marketplace.docx` v1.0
**Pre-requisites for UAT to start:**
- Staging deployed (Postgres + Redis + S3 + reverse proxy + DNS)
- Seed data loaded (1 admin, ≥3 dealers, ≥10 listings of each cert tier)
- MSG91 + SendGrid configured with sandbox / dev keys (real OTP, real emails)
- Torque DMS sandbox accessible (or acceptance run on mock with explicit sign-off)

---

## 1. Test users
| Role | Login | Password | Notes |
|---|---|---|---|
| Admin | `admin@hd-cpo.local` | `Admin@123!` | Rotate before prod |
| Dealer | `gurgaon-hd` | `Dealer@123!` | Capital Harley-Davidson Gurgaon |
| Buyer | n/a | n/a | OTP-only; use test phones |

## 2. Buyer-flow acceptance criteria

| # | PRD ref | Criterion | Pass |
|---|---|---|---|
| B-01 | §6.1.1 | Home loads with hero + 6 benefit tiles + dealer locator within 2.5s LCP on 4G | ☐ |
| B-02 | §6.1.2 | Search filters drive URL params; refresh restores filter state | ☐ |
| B-03 | §6.1.2 AC2 | Search results paginate at 12/page; sort by newest / priceAsc / priceDesc / kmsAsc works | ☐ |
| B-04 | §6.1.2 AC3 | Listing card shows CPO badge for certified, As-Is for the other tier | ☐ |
| B-05 | §6.1.3 AC1 | Listing detail emits JSON-LD `Vehicle` schema in `<head>` (validate via Google Rich Results Test) | ☐ |
| B-06 | §6.1.3 | EMI calculator updates live on tenure / down payment / rate change | ☐ |
| B-07 | §6.1.3 | CPO listing shows Inspection-Passed banner with "Download inspection report" link → opens PDF | ☐ |
| B-08 | §6.1.4 | Enquire button opens Info-Gate modal; cannot submit without OTP | ☐ |
| B-09 | §6.1.4 | OTP send → real SMS arrives (MSG91 sandbox); rate limit blocks 6th send/min | ☐ |
| B-10 | §6.1.4 | OTP verify → enquiry submitted → confirmation shows enquiry ID | ☐ |
| B-11 | §6.1.5 | Buyer pastes enquiry ID at `/track`, sees pipeline + dealer name + last update | ☐ |
| B-12 | §6.1.5 | Buyer pastes order ID at `/track`, sees 6-stage delivery timeline | ☐ |
| B-13 | §6.1.6 | `/sell-bike` accepts VIN + bike model + city; OTP-gated; success message names assigned dealer | ☐ |
| B-14 | §8 | All H-D 2026 brand colours/fonts respected (orange used for emphasis only); no `Harley Davidson` (without hyphen) typos | ☐ |
| B-15 | §6.1 | Cookie banner appears on first visit; "Necessary only" / "Accept all" both persist for 180 days | ☐ |
| B-16 | §9 | Buyer site Lighthouse: LCP < 2.5s, CLS < 0.1, TBT < 300ms | ☐ |
| B-17 | §9 | axe-core: 0 critical violations on home, search, detail pages | ☐ |
| B-18 | §9 | Keyboard-only navigation works on home → search → detail → enquire flow | ☐ |

## 3. Dealer-flow acceptance criteria

| # | PRD ref | Criterion | Pass |
|---|---|---|---|
| D-01 | §6.2.1 | Login with seeded credentials; bad password → clear error; account lockout after 5 fails (if enabled) | ☐ |
| D-02 | §6.2.2 | Dashboard shows Active listings, 7-day leads, trade-ins, 60-day stale flag | ☐ |
| D-03 | §6.2.3 | Add Listing wizard Step 1: enter VIN → Torque returns vehicle in <3s; bad VIN rejected | ☐ |
| D-04 | §6.2.3 | Step 2: download blank 110-pt template PDF; upload completed PDF (≤10MB, PDF only) | ☐ |
| D-05 | §6.2.3 | Step 2: pick CPO or As-Is; CPO requires inspection PDF; As-Is allows skip | ☐ |
| D-06 | §6.2.3 | Step 3: price/kms/description/photos validated (≥1 photo, ≥20 char description) | ☐ |
| D-07 | §6.2.3 | Step 4 review: CPO listing shows CPO Kit Documents auto-fetched (7 docs); As-Is hides this section | ☐ |
| D-08 | §6.2.3 | Submit → status DRAFT; visible in "Pending" tab on My Listings | ☐ |
| D-09 | §6.2.4 | My Listings tabs: All / Pending / Live / Off / Sold / Removed with badge counts | ☐ |
| D-10 | §6.2.4 | Live listing → Mark Sold → Torque receives status update (verify in Torque sandbox) | ☐ |
| D-11 | §6.2.4 | Live listing → Turn Off → status DEACTIVATED; buyer search no longer surfaces it | ☐ |
| D-12 | §6.2.4 | Admin Return-to-Dealer feedback appears as red banner on Pending tab | ☐ |
| D-13 | §6.2.4 | Editing a returned draft clears the admin feedback | ☐ |
| D-14 | §6.2.5 | Buyer Enquiries list shows new enquiries within 60s of buyer submit | ☐ |
| D-15 | §6.2.5 | Lead detail: 6-stage pipeline (NEW / ON-SITE VISIT / LOAN APPROVAL / CLOSED / SUCCESS / DEAD) | ☐ |
| D-16 | §6.2.5 | Move To dropdown updates status; comment thread persists; click-to-call + email open native handlers | ☐ |
| D-17 | §6.2.5 | Seller Enquiries (trade-ins) list shows seller name, VIN, KMs, contact | ☐ |
| D-18 | §6.2.5 | General Leads list shows model interest + price range when supplied | ☐ |

## 4. Admin-flow acceptance criteria

| # | PRD ref | Criterion | Pass |
|---|---|---|---|
| A-01 | §6.3.1 | Login with seeded credentials; refresh works; logout clears tokens | ☐ |
| A-02 | §6.3.2 | Dashboard date-range tiles render for today / 7d / 30d | ☐ |
| A-03 | §6.3.3 | Dealer CRUD: create dealer with all required fields (city, pincode, lat/lng, torqueDealerId) | ☐ |
| A-04 | §6.3.3 | Excel bulk import accepts a 5-row .xlsx; bad rows rejected with line-by-line errors | ☐ |
| A-05 | §6.3.3 | Suspend dealer → dealer login blocked; reactivate restores access | ☐ |
| A-06 | §6.3.4 | Listings tabs: Ongoing / Sold / Removed / Drafts / Deactivated / All | ☐ |
| A-07 | §6.3.4 | Drafts tab shows count badge; clicking row opens Preview Drawer with full detail | ☐ |
| A-08 | §6.3.4 | Publish DRAFT → status ACTIVE → visible in buyer search within 60s | ☐ |
| A-09 | §6.3.4 | Return to Dealer requires ≥5 char feedback; listing stays DRAFT; dealer sees the banner | ☐ |
| A-10 | §6.3.4 | Remove requires ≥3 char reason; status REMOVED; audit log captures the action | ☐ |
| A-11 | §6.3.4 | Deactivate ACTIVE listing → status DEACTIVATED; dealer can re-activate | ☐ |
| A-12 | §6.3.5 | Static content editor saves with version increment; published copy shows on buyer site | ☐ |
| A-13 | §6.3.6 | Audit log filterable by action + entity type; CSV export downloads correctly | ☐ |

## 5. Cross-cutting acceptance criteria

| # | PRD ref | Criterion | Pass |
|---|---|---|---|
| X-01 | §7 | Torque sandbox: VIN lookup, CPO kit fetch, inspection push, sold-status push all succeed | ☐ |
| X-02 | §9.3 | Phone + email stored encrypted (psql query on enquiry table → emailEnc/phoneEnc are base64, not plaintext) | ☐ |
| X-03 | §9.3 | OTP attempts: 5 wrong codes → 30-min lockout; lockout key visible in Redis | ☐ |
| X-04 | §9.6 | Postgres backup configured; tested restore on a snapshot | ☐ |
| X-05 | §9 | Sentry receives a test exception from each app (FE + BE) | ☐ |
| X-06 | §9 | Reverse proxy enforces HTTPS; HTTP → 301 to HTTPS; HSTS header present | ☐ |
| X-07 | §6 | DPDP cookie banner persists; Privacy + Terms pages live & published | ☐ |
| X-08 | §10 | All 6 sprints' Definition-of-Done items demonstrably met (lint, typecheck, tests, axe, manual QA matrix) | ☐ |

## 6. Manual QA browser matrix (per dev plan §12)

| Browser | Buyer | Dealer | Admin |
|---|---|---|---|
| Chrome desktop (latest) | ☐ | ☐ | ☐ |
| Firefox desktop (latest) | ☐ | ☐ | ☐ |
| Safari desktop (latest macOS) | ☐ | ☐ | ☐ |
| iOS Safari 14+ | ☐ | ☐ | n/a |
| Android Chrome (latest) | ☐ | ☐ | n/a |

## 7. Bug triage workflow

1. UAT tester logs an issue with: page URL, steps, expected vs actual, screenshot, browser/device, severity (Critical / Major / Minor).
2. Vendor triages within 1 business day; severity confirmed or downgraded.
3. **Critical** (data loss, security, blocker for next test): fix in ≤24h.
4. **Major** (feature broken on a documented criterion): fix in ≤3 days.
5. **Minor** (cosmetic, edge case): logged for v1.1 unless client objects.
6. Each fix retested against the original criterion before re-closing.

## 8. Sign-off

UAT is **passed** when:
- All Critical and Major rows in §2-§5 are ticked **Pass**.
- ≤5 Minor items remain open with explicit client acknowledgement.
- §6 browser matrix is clean for all Critical paths.
- §1 environment prerequisites are satisfied.

The vendor delivers a final commit hash + tagged release; the client signs the acceptance certificate; per SoW, the source code handover then completes.

---

**Version:** 1.0 · **Last updated:** 2026-05-06
