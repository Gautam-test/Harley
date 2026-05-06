# Deploy artefacts

Stand-alone files that don't fit cleanly into source dirs.

| File | Purpose |
|---|---|
| [`nginx.sample.conf`](nginx.sample.conf) | Reference reverse-proxy config — three subdomains (apex, `dealer.`, `admin.`) → three SPA static dirs + one Express API. SSL via Let's Encrypt. Edit hosts + cert paths to match your environment. |

For the broader runbook see [`../../HANDOVER.md`](../../HANDOVER.md).
