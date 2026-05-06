# Database snapshots

`dev-dump.sql` is a `pg_dump` of the dev Postgres at the time the snapshot was taken. It includes the schema (DDL), all data (15 dealers, ~57 listings, sample order, lead history, audit log, OTPs), and `--clean --if-exists` drop statements so it's idempotent — running it on an existing database wipes the public schema and reloads from scratch.

## Restore on a fresh machine

```bash
# 1. Install Postgres 16 (or higher 16.x).
#    Windows: https://www.postgresql.org/download/windows/
#    macOS:   brew install postgresql@16
#    Linux:   apt-get install postgresql-16

# 2. Create the role + database the seed expects.
psql -U postgres -c "CREATE USER hdcpo WITH PASSWORD 'hdcpo_dev_password';"
psql -U postgres -c "CREATE DATABASE hd_cpo_marketplace OWNER hdcpo;"

# 3. Load the dump.
PGPASSWORD=hdcpo_dev_password psql -h localhost -U hdcpo -d hd_cpo_marketplace -f db/dev-dump.sql
```

After this `pnpm dev` will boot against a fully-populated database — no `prisma:seed` needed.

## When to refresh this file

- Re-dump after any **schema change** (Prisma migration) you want frozen into the snapshot — otherwise teammates pulling the dump get an out-of-sync schema.
- Re-dump after seeding new demo data (additional dealers, listings, sample leads) you want bundled.

```bash
PGPASSWORD=hdcpo_dev_password "/c/Program Files/PostgreSQL/16/bin/pg_dump.exe" \
  --no-owner --no-privileges --clean --if-exists --quote-all-identifiers \
  -h localhost -p 5432 -U hdcpo -d hd_cpo_marketplace -f db/dev-dump.sql
```

## What's NOT in the dump

- `.env` files — kept out of git via `.gitignore`. Each developer needs their own.
- Embedded-postgres data (`apps/api/.embedded-postgres/`) — if you used the auto-boot mode, that directory has its own state.
- Anything generated at runtime (image uploads, log files).

## Privacy note

The dump contains synthetic dealer/listing data plus whatever leads have been entered locally for testing. None of this should be treated as production PII, but if you've manually entered real contact details against test listings during development, those entries land here too. Strip them before re-dumping if that matters for your workflow.
