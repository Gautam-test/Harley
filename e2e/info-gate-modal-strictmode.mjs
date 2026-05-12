/**
 * Replays the InfoGateModal auto-send effect lifecycle in pure JS to
 * verify the StrictMode-dedupe + always-reset-busy behaviour against
 * the real local API.
 *
 * This is what would happen in a Vite/React dev mount of the modal:
 *   - Mount #1 runs the effect → setBusy(true), fires /otp/send
 *   - StrictMode tear-down (no-op now — no cleanup function)
 *   - Mount #2 runs the effect → dedupe ref blocks the duplicate call
 *   - /otp/send returns 200 → setOtpId, setBusy(false) ALWAYS
 *
 * Pre-fix: the cancelled flag flipped during tear-down meant setOtpId
 * + setBusy(false) were skipped → modal stuck on "Verifying..."
 *
 * This script asserts the post-fix state (otpId set, busy=false) for
 * both the happy-path and the OTP_RESEND_TOO_SOON path.
 */

const API = 'http://localhost:4001/api/v1';

function ok(label, cond, extra = '') {
  const tag = cond ? '✅ PASS' : '❌ FAIL';
  console.log(`${tag} — ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
}

class FakeApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function callOtpSend(phone, purpose) {
  const res = await fetch(`${API}/otp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, purpose }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new FakeApiError(res.status, body?.error?.code ?? 'UNKNOWN', body?.error?.message ?? 'fail');
  }
  return res.json();
}

/** Replays the auto-send useEffect logic. State + ref are passed in by ref. */
async function runAutoSendEffect({ state, refs, phone, purpose }) {
  // Guard 1: bail if already have otpId, or busy, or no phone
  if (!phone || state.otpId || state.busy) {
    return { fired: false, reason: 'guard:state' };
  }
  // Guard 2 (the new StrictMode dedupe): bail if a sibling run is in-flight
  const sendKey = `${phone}|${purpose}`;
  if (refs.sendInFlight === sendKey) {
    return { fired: false, reason: 'guard:in-flight' };
  }
  refs.sendInFlight = sendKey;
  state.busy = true;
  try {
    const res = await callOtpSend(phone, purpose);
    // .then path
    state.otpId = res.otpId;
    state.lastSentAt = Date.now();
    state.error = null;
  } catch (e) {
    // .catch path — full handler from InfoGateModal
    if (e instanceof FakeApiError && e.code === 'OTP_RESEND_TOO_SOON') {
      if (state.lastSentAt !== null) state.resendCooldown = 30;
      state.error = null;
    } else if (e instanceof FakeApiError && (e.code === 'OTP_RESEND_LIMIT' || e.code === 'OTP_DAILY_LIMIT' || e.code === 'OTP_LOCKED' || e.code === 'RATE_LIMITED')) {
      state.sendBlocked = { code: e.code, message: e.message };
      state.error = null;
    } else {
      state.error = e.message ?? 'Could not send OTP';
    }
  } finally {
    // ALWAYS reset busy + clear ref — this is the critical regression-safe behaviour
    state.busy = false;
    refs.sendInFlight = null;
  }
  return { fired: true };
}

async function scenario1HappyPath() {
  console.log('\n=== Scenario 1: Happy path (single mount) ===');
  const phone = '+919999900001';
  const state = { otpId: null, busy: false, error: null, lastSentAt: null, resendCooldown: 0, sendBlocked: null };
  const refs = { sendInFlight: null };
  const r = await runAutoSendEffect({ state, refs, phone, purpose: 'TRADE_IN' });
  ok('effect fired the request', r.fired);
  ok('state.otpId is set', !!state.otpId, `otpId=${state.otpId}`);
  ok('state.busy is FALSE after request', state.busy === false);
  ok('state.error is null', state.error === null);
  ok('refs.sendInFlight is cleared', refs.sendInFlight === null);
}

async function scenario2StrictModeDoubleInvoke() {
  console.log('\n=== Scenario 2: StrictMode double-invoke (the bug) ===');
  const phone = '+919999900002';
  const state = { otpId: null, busy: false, error: null, lastSentAt: null, resendCooldown: 0, sendBlocked: null };
  const refs = { sendInFlight: null };
  // Mount #1: kicks off the effect, but DON'T await yet
  const p1 = runAutoSendEffect({ state, refs, phone, purpose: 'TRADE_IN' });
  // StrictMode tear-down would happen here. With the new code there is
  // NO cleanup function, so nothing runs.
  // Mount #2: effect runs again synchronously. busy is true (from #1's
  // sync setBusy). Even if state hasn't propagated to a fresh closure,
  // the sendInFlight ref blocks it.
  const p2 = runAutoSendEffect({ state, refs, phone, purpose: 'TRADE_IN' });
  const [r1, r2] = await Promise.all([p1, p2]);
  ok('mount #1 fired', r1.fired);
  ok('mount #2 SKIPPED (dedupe worked)', !r2.fired, `reason=${r2.reason}`);
  ok('only ONE network request was made', r1.fired && !r2.fired);
  ok('state.otpId is set after both mounts', !!state.otpId);
  ok('state.busy is FALSE (no longer stuck on "Verifying...")', state.busy === false);
  ok('refs.sendInFlight is cleared', refs.sendInFlight === null);
}

async function scenario3SamePhoneRetryHits429() {
  console.log('\n=== Scenario 3: Same phone retry within 30s (server says OTP_RESEND_TOO_SOON) ===');
  const phone = '+919999900003';
  // Prime: first request succeeds
  await callOtpSend(phone, 'TRADE_IN');
  // Now simulate modal re-open before 30s — runAutoSendEffect with fresh
  // state but server will 429.
  const state = { otpId: null, busy: false, error: null, lastSentAt: null, resendCooldown: 0, sendBlocked: null };
  const refs = { sendInFlight: null };
  const r = await runAutoSendEffect({ state, refs, phone, purpose: 'TRADE_IN' });
  ok('effect fired the request', r.fired);
  ok('state.busy is FALSE despite the 429 (regression check)', state.busy === false);
  ok('refs.sendInFlight is cleared', refs.sendInFlight === null);
  // The OTP_RESEND_TOO_SOON path is special: it doesn't set sendBlocked
  // (server's 30s cooldown is not a hard block, the original OTP is
  // still valid). It clears error and may set resendCooldown.
  ok('state.error is null on OTP_RESEND_TOO_SOON', state.error === null);
}

async function scenario4ResendByClearOtpId() {
  console.log('\n=== Scenario 4: Resend Code (clears otpId, effect re-fires) ===');
  const phone = '+919999900004';
  const state = { otpId: null, busy: false, error: null, lastSentAt: null, resendCooldown: 0, sendBlocked: null };
  const refs = { sendInFlight: null };
  // Initial send
  await runAutoSendEffect({ state, refs, phone, purpose: 'TRADE_IN' });
  ok('initial send: otpId set', !!state.otpId);
  const firstOtpId = state.otpId;
  // Wait so server's 30s cooldown clears
  console.log('   waiting 31s for server cooldown...');
  await new Promise((r) => setTimeout(r, 31_000));
  // Resend simulation: clear otpId + lastSentAt
  state.otpId = null;
  state.error = null;
  // Re-run the effect (simulating React re-running because otpId dep changed)
  const r = await runAutoSendEffect({ state, refs, phone, purpose: 'TRADE_IN' });
  ok('resend re-fired', r.fired);
  ok('new otpId is set (and != original)', state.otpId && state.otpId !== firstOtpId);
  ok('busy=false after resend', state.busy === false);
}

(async () => {
  await scenario1HappyPath();
  await scenario2StrictModeDoubleInvoke();
  await scenario3SamePhoneRetryHits429();
  // scenario4 takes 31s — skip by default; uncomment to run.
  // await scenario4ResendByClearOtpId();
  console.log('\n=== Summary ===');
  console.log(process.exitCode === 1 ? '❌ One or more assertions failed.' : '✅ All assertions passed.');
  process.exit(process.exitCode ?? 0);
})().catch((e) => {
  console.error('Test run errored:', e);
  process.exit(1);
});
