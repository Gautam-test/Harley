import nodemailer, { type Transporter } from 'nodemailer';
import { getEnv } from '../../config/env.js';
import { logger } from '../../config/logger.js';

// Provider-agnostic email interface (PRD §4.1, Open Question 11).
// Mock prints to logs in dev; the SMTP adapter sends real mail via
// nodemailer (Gmail / any SMTP server). SendGrid / SES could slot in
// here too but aren't wired yet.

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailProvider {
  send(msg: EmailMessage): Promise<void>;
}

class MockEmailProvider implements EmailProvider {
  async send(msg: EmailMessage): Promise<void> {
    logger.info({ to: msg.to, subject: msg.subject }, '✉️ [MOCK EMAIL]');
  }
}

// Real SMTP transport. Credentials come from env (SMTP_USER / SMTP_PASS)
// which are loaded only from the gitignored .env — never committed. The
// transporter is created once and reused. The `from` address falls back
// to the authenticated user when EMAIL_FROM isn't a verified sender
// (Gmail rewrites From to the auth user anyway).
class SmtpEmailProvider implements EmailProvider {
  private transporter: Transporter;
  private from: string;

  constructor() {
    const env = getEnv();
    this.from = env.EMAIL_FROM;
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE, // true → 465 (SSL); false → 587 (STARTTLS)
      auth:
        env.SMTP_USER && env.SMTP_PASS
          ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
          : undefined,
    });
  }

  async send(msg: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    });
    logger.info({ to: msg.to, subject: msg.subject }, '✉️ [SMTP] sent');
  }
}

let cached: EmailProvider | null = null;
export function emailProvider(): EmailProvider {
  if (cached) return cached;
  const env = getEnv();
  switch (env.EMAIL_PROVIDER) {
    case 'smtp':
      cached = new SmtpEmailProvider();
      break;
    case 'mock':
    default:
      cached = new MockEmailProvider();
  }
  return cached;
}

// PRD §6.2.8 — branded notification templates. Kept inline at v1; pull into
// a templating engine (handlebars / mjml) in a later sprint if volume grows.
export function dealerLeadEmail(opts: {
  dealerName: string;
  leadType: 'BUYER' | 'TRADE_IN';
  buyerName: string;
  buyerCity?: string;
  contextLine?: string;
}): EmailMessage {
  const subjectMap = {
    BUYER: 'New listing enquiry — H-D Certified',
    TRADE_IN: 'New trade-in enquiry — H-D Certified',
  } as const;
  return {
    to: '', // Caller sets the dealer email (decrypted out-of-band).
    subject: subjectMap[opts.leadType],
    html: `<div style="font-family:Arial,sans-serif;background:#000;color:#fff;padding:24px">
  <h1 style="color:#FF6600;text-transform:uppercase;letter-spacing:0.04em;">H-D Certified</h1>
  <p>Hi ${opts.dealerName},</p>
  <p>You have a new ${opts.leadType.toLowerCase().replace('_', '-')} lead from <strong>${opts.buyerName}</strong>${opts.buyerCity ? ` (${opts.buyerCity})` : ''}.</p>
  ${opts.contextLine ? `<p>${opts.contextLine}</p>` : ''}
  <p>Sign in to your dealer portal to follow up.</p>
</div>`,
    text: `New ${opts.leadType} lead from ${opts.buyerName}${opts.buyerCity ? ` (${opts.buyerCity})` : ''}. Sign in to follow up.`,
  };
}

// ── Shared branded shell for the trigger templates below. `body` is
//    caller-supplied inner HTML; no templating dependency. ──────────────
function shell(heading: string, body: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f4f4;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff">
    <div style="background:#111;padding:16px 24px">
      <span style="color:#fff;font-weight:bold;letter-spacing:0.04em">H&#8209;D</span><span style="color:#FF6600;font-weight:bold;letter-spacing:0.04em">&nbsp;CERTIFIED</span>
    </div>
    <div style="padding:24px;color:#1a1a1a">
      <h1 style="font-size:18px;margin:0 0 16px">${heading}</h1>
      ${body}
    </div>
    <div style="padding:14px 24px;border-top:1px solid #eee;color:#888;font-size:12px">
      H-D Certified &middot; Approved Used Harley-Davidson&reg; Motorcycles
    </div>
  </div>
</div>`;
}
const para = (t: string) => `<p style="font-size:14px;line-height:1.6;margin:0 0 12px">${t}</p>`;

// ── Trigger templates (PRD §6.2.8 expanded). Each returns an EmailMessage
//    with `to` set by the caller. ───────────────────────────────────────

/** Buyer: enquiry submission confirmation. */
export function buyerEnquiryConfirmationEmail(opts: {
  buyerName: string;
  bikeLabel: string;
  referenceId: string;
}): EmailMessage {
  return {
    to: '',
    subject: 'We received your enquiry — H-D Certified',
    html: shell(
      'We received your enquiry',
      para(`Hi ${opts.buyerName},`) +
        para(`Thanks for your interest in the <strong>${opts.bikeLabel}</strong>. Your enquiry has been routed to an authorised Harley-Davidson&reg; dealer who will reach out shortly.`) +
        para(`Reference ID: <strong>${opts.referenceId}</strong>`),
    ),
    text: `Hi ${opts.buyerName}, thanks for your enquiry on the ${opts.bikeLabel}. A dealer will reach out shortly. Reference ID: ${opts.referenceId}`,
  };
}

/** Buyer: dealer action / response notification (status change or comment). */
export function buyerDealerUpdateEmail(opts: {
  buyerName: string;
  bikeLabel: string;
  updateText: string;
}): EmailMessage {
  return {
    to: '',
    subject: 'Update on your enquiry — H-D Certified',
    html: shell(
      'Update on your enquiry',
      para(`Hi ${opts.buyerName},`) +
        para(`There's an update on your enquiry for the <strong>${opts.bikeLabel}</strong>:`) +
        para(`<em>${opts.updateText}</em>`),
    ),
    text: `Hi ${opts.buyerName}, update on your ${opts.bikeLabel} enquiry: ${opts.updateText}`,
  };
}

/** Dealer: listing approved (moved LIVE by admin). */
export function dealerListingApprovedEmail(opts: {
  dealerName: string;
  bikeLabel: string;
}): EmailMessage {
  return {
    to: '',
    subject: 'Your listing is live — H-D Certified',
    html: shell(
      'Your listing is live',
      para(`Hi ${opts.dealerName},`) +
        para(`Your listing <strong>${opts.bikeLabel}</strong> has been approved and is now LIVE on the H-D Certified marketplace.`),
    ),
    text: `Hi ${opts.dealerName}, your listing ${opts.bikeLabel} is now live on H-D Certified.`,
  };
}

/** Dealer: listing rejected / removed by admin, with reason. */
export function dealerListingRemovedEmail(opts: {
  dealerName: string;
  bikeLabel: string;
  reason: string;
}): EmailMessage {
  return {
    to: '',
    subject: 'Your listing was removed — H-D Certified',
    html: shell(
      'Your listing was removed',
      para(`Hi ${opts.dealerName},`) +
        para(`Your listing <strong>${opts.bikeLabel}</strong> has been removed by an administrator.`) +
        para(`<strong>Removal reason:</strong> ${opts.reason}`) +
        para(`Please review and re-submit, or contact H-D support if you believe this is an error.`),
    ),
    text: `Hi ${opts.dealerName}, your listing ${opts.bikeLabel} was removed by admin. Reason: ${opts.reason}`,
  };
}

/** Admin: new listing landed in the approval queue (dealer created or
 *  reactivated a listing). */
export function adminListingQueuedEmail(opts: {
  dealerName: string;
  bikeLabel: string;
  action: 'created' | 'reactivated';
}): EmailMessage {
  return {
    to: '',
    subject: 'Listing pending review — H-D Certified',
    html: shell(
      'Listing pending review',
      para(`A listing needs admin review:`) +
        para(`<strong>${opts.bikeLabel}</strong><br/>Dealer: ${opts.dealerName}<br/>Action: ${opts.action === 'created' ? 'New listing' : 'Reactivated listing'}`) +
        para(`Open the approval queue to publish or return it.`),
    ),
    text: `Listing pending review: ${opts.bikeLabel} from ${opts.dealerName} (${opts.action}).`,
  };
}

/** Admin: new dealer access request from a prospective dealership. */
export function adminNewDealerRequestEmail(opts: {
  dealershipName: string;
  contactName: string;
  contactEmail: string;
  city?: string;
}): EmailMessage {
  return {
    to: '',
    subject: 'New dealer access request — H-D Certified',
    html: shell(
      'New dealer access request',
      para(`A new dealership has requested portal access:`) +
        para(`<strong>${opts.dealershipName}</strong>${opts.city ? ` &middot; ${opts.city}` : ''}<br/>Contact: ${opts.contactName} &middot; ${opts.contactEmail}`) +
        para(`Review and provision credentials in the admin portal.`),
    ),
    text: `New dealer access request: ${opts.dealershipName} — ${opts.contactName} (${opts.contactEmail}).`,
  };
}
