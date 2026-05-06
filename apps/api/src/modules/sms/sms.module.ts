import { getEnv } from '../../config/env.js';
import { logger } from '../../config/logger.js';

// Provider-agnostic SMS interface (PRD §4.1, Open Question 10).
// Mock prints to logs in dev; live providers (MSG91/Twilio) implement this same shape.
export interface SmsProvider {
  sendOtp(phone: string, code: string): Promise<void>;
}

class MockSmsProvider implements SmsProvider {
  async sendOtp(phone: string, code: string): Promise<void> {
    logger.info({ phone, code }, '📱 [MOCK SMS] OTP code (visible only because TORQUE/SMS_PROVIDER=mock)');
  }
}

let cached: SmsProvider | null = null;
export function smsProvider(): SmsProvider {
  if (cached) return cached;
  const env = getEnv();
  switch (env.SMS_PROVIDER) {
    case 'mock':
    default:
      cached = new MockSmsProvider();
  }
  return cached;
}
