# Demo OTP Modal — Troubleshooting Guide

When the buyer-side OTP modal's **Verify** and **Resend** buttons appear
unclickable on `https://harleydavidson.ciadmin.in` (and the browser's
Network tab stays blank when you click them), the cause is almost always
one of the four below.

After the client-side hardening pushed in commit `<this commit>`:

- Hung backend → buttons re-enable in **10 s** with `TIMEOUT` error
- HTML returned for `/api/*` → buttons re-enable immediately with `BAD_RESPONSE` error
- Network failure → buttons re-enable immediately with `NETWORK_ERROR` error

So if the buttons stay disabled for more than ~15 s, that is itself a
client-side bug (not a deploy issue) and the dev team should be told.

## Five-second triage

On the demo, open DevTools → Console. The diagnosable cause shows up as
an `ApiError` with one of these `code` values:

| `code` | Meaning | Fix |
|---|---|---|
| `TIMEOUT` | API didn't respond within 10 s | API process is down or unresponsive — see step 1 below |
| `BAD_RESPONSE` | Apache returned the SPA's `index.html` for `/api/v1/...` | Reverse-proxy mis-configured — see step 2 below |
| `NETWORK_ERROR` | DNS / TCP failure | Apache itself isn't running or the cert expired |
| `RATE_LIMITED` | Per-IP OTP cap hit | Wait 1 min, or set `E2E_BYPASS_OTP_LIMITER=1` on the API |
| `OTP_RESEND_LIMIT` / `OTP_DAILY_LIMIT` / `OTP_LOCKED` | Per-phone abuse defence tripped | Modal will show its own blocking panel — wait the documented window |

## Step 1 — Is the API process actually running?

SSH to the demo server and run:

```bash
# What's listening on :4001?
ss -tlnp | grep :4001

# If nothing, start the API:
cd /path/to/hd-cpo-marketplace
pnpm --filter @hd-cpo/api start    # or `pnpm dev` for hot-reload mode

# Direct hit on the API (bypassing Apache):
curl -s http://localhost:4001/api/v1/health
# Expected: {"status":"ok","uptime":...,"timestamp":"..."}

# Hit through Apache (the path the browser uses):
curl -s https://harleydavidson.ciadmin.in/api/v1/health
# Expected: same JSON
```

If `:4001` isn't listening, the API isn't running — start it. If it's
listening locally but Apache returns a 502, check `apache-error.log`.

## Step 2 — Is Apache forwarding `/api/*` correctly?

The proxy lives in `docs/deploy/apache.harleydavidson.conf`:

```
ProxyPass        /api/  http://127.0.0.1:4001/api/
ProxyPassReverse /api/  http://127.0.0.1:4001/api/
```

Verify the live config matches:

```bash
sudo apachectl -S | grep harleydavidson
sudo grep -A2 'ProxyPass' /etc/apache2/sites-enabled/harleydavidson.conf

# Reload after any change:
sudo apachectl configtest && sudo systemctl reload apache2
```

A common failure mode: someone edited the conf and dropped the trailing
slashes on either side of `/api/`. Both sides must have the slash, or
Apache routes `/api/v1/...` to `/v1/...` on the upstream and the API
returns 404 (which the SPA shows as a generic "Could not load" error).

## Step 3 — Is Redis up?

OTP send/verify writes to Redis. If Redis is down, `/api/v1/otp/send`
hangs ~5 s then 500s.

```bash
# Quick check
redis-cli ping             # → PONG
# Or for the in-process mock, look for this line in API logs:
#   "Redis: using in-process mock (REDIS_URL=mock://)"
```

Set `REDIS_URL=mock://` in the API's `.env` to use the in-process mock
on demo if you don't want to run a real Redis container.

## Step 4 — Is the OTP rate limit set to production mode?

The API's IP-level rate limiter only kicks in when `NODE_ENV=production`.
On a demo where you're testing repeatedly with the same number, you may
hit it. Either:

- Set `NODE_ENV=development` on the demo API (recommended — demo isn't
  serving real users), OR
- Set `E2E_BYPASS_OTP_LIMITER=1` on the API process to bypass the
  IP-level cap while keeping the per-phone abuse guards.

## Step 5 — Verify in the browser

1. Open `https://harleydavidson.ciadmin.in` in an incognito window.
2. DevTools → Network → filter "otp".
3. Open the Sell Your Motorcycle modal, fill the form, submit.
4. You should see `POST /api/v1/otp/send` complete in <500 ms with status
   200 and a JSON body `{"otpId":"..."}`.
5. Type any 6 digits (mock SMS accepts anything when `SMS_PROVIDER=mock`).
6. Click Verify. You should see `POST /api/v1/otp/verify` → 200 with
   `{"verifiedToken":"..."}`.

If step 4 returns HTML, fix Apache (step 2). If it hangs >10 s, the API
is unresponsive (step 1). If it returns `RATE_LIMITED`, fix step 4.

## Permanent fixes already shipped

The following client-side hardening is already in the buyer + dealer +
admin SPAs (commit `<this commit>`) so the failure modes above can never
again wedge a button stuck-disabled:

- **10 s fetch timeout** in all three `lib/api.ts` files — every API call
  aborts after 10 s and surfaces a readable `TIMEOUT` error.
- **JSON-vs-HTML guard** — non-JSON responses throw `BAD_RESPONSE` with
  a message that points at the reverse-proxy.
- **15 s busy-state failsafe** in the buyer's `InfoGateModal` — if `busy`
  is somehow stuck `true`, it auto-resets after 15 s with a "Request
  timed out" toast so the buttons re-enable.
