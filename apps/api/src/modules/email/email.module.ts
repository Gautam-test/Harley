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
