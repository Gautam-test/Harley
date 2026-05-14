// Shared VIN-handling helpers.
//
// retireVinPrefix: when a dealer creates a new listing reusing the VIN
// of a previously SOLD or REMOVED bike, createListing in
// dealer-listings.service.ts retires the old row's vin column to a
// sentinel format (`sold:cmid:VIN` / `removed:cmid:VIN`) so the unique
// constraint on `vin` doesn't block the new create. This sentinel is a
// PURE storage artefact — no client should ever see it. Use rootVin()
// in every API surface that returns vin to a client.

const RETIRE_PREFIX_RE = /^(removed|sold|deactivated):[^:]+:/;

/**
 * Strip the `removed:cmid:` / `sold:cmid:` / `deactivated:cmid:` retire-
 * prefix from a stored VIN, returning the original 17-character VIN.
 * Pass through cleanly when the VIN has no prefix.
 *
 * Used by every API path that returns vin to a client (public search,
 * public detail, admin list, admin detail, dealer list, dealer detail)
 * so a retired row never leaks the sentinel format. The DB-stored
 * value stays prefixed (the unique constraint depends on it); only the
 * surface presentation is normalised.
 */
export function rootVin(storedVin: string): string {
  return storedVin.replace(RETIRE_PREFIX_RE, '');
}

/** True when this VIN has been retired (carries the sentinel prefix). */
export function isRetiredVin(storedVin: string): boolean {
  return RETIRE_PREFIX_RE.test(storedVin);
}
