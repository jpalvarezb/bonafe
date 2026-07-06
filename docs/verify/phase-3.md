# Phase 3 verification — PWA & offline field capture

Setup as in phase-1.md. Note: the service worker is only generated in production
builds (`pnpm build` uses `--webpack`; Serwist doesn't support Turbopack builds).
The outbox itself works in dev — only page caching needs the SW.

## Offline round-trip (Chrome DevTools → Network → Offline, or a real device)

1. Log in, open **Monitoreo**. Go offline.
2. Create 2–3 monitoring records → each appears instantly as an amber pending
   row ("Se guardó en este dispositivo…"); header badge shows
   "Sin conexión — N pendientes". The page does NOT navigate or crash.
3. Open **Actividades → Registrar actividad** (visited earlier so it's cached
   in prod; in dev navigate before going offline). Log an activity with cost
   lines → form resets, stays put, pending count increments.
4. Go back online → within seconds the badge clears, pending rows disappear,
   and the records appear in the lists / dashboard totals.
5. **Exactly-once**: `SELECT count(*), count(DISTINCT id) FROM monitoring_records;`
   — counts match. Reload mid-sync, spam the pending badge, kill the tab and
   reopen: no duplicates (verified 2026-07-05: crash + zombie replay + 5
   redundant flushes → 8 rows / 8 distinct ids).
6. **Rejected items**: craft a bad entry (e.g. delete the referenced parcel
   from another session before syncing) → red badge → "Problemas de
   sincronización" lists it with the server error; discard removes it.
   Transient failures (server down, expired session) do NOT reject — entries
   stay pending and retry (30s interval / online event / badge click).

## PWA install (production: `pnpm build && pnpm start`)

7. `curl -I localhost:3000/sw.js` → 200; `/manifest.webmanifest` → 200.
8. Chrome shows the install prompt (address-bar icon); installed app opens
   standalone with the green AgroPeq icon.
9. Map tiles browsed once render offline (CacheFirst, 30-day cap).
10. Shared-device check: authed HTML/RSC/API are NOT runtime-cached
    (sw.ts filters Serwist's "apis"/"next-data"/"others" caches), so a second
    user can't be served the first user's cached org pages after logout.

## Automated

`pnpm test` · `pnpm typecheck` · `pnpm build` — green at Phase 3 close.
Opus review applied: transient batch failures never terminal-reject queued
captures; activity form recovers from validation throws with a visible error;
authed-response caches excluded from the SW; dead code removed.
