# Phase 8 verification — Satellite climate (rainfall ingest + cycle analytics)

Setup as in phase-1.md. No API keys required: Open-Meteo is keyless.
Requires internet access for the ingest steps.

## Satellite ingest

1. **Clima** → "Ingesta satelital" card: Finca La Esperanza, Open-Meteo,
   default last-30-days range → "Importar lluvia satelital" → success banner
   with the row count; `to` is silently clamped to today−2 (archive lag).
2. Readings list now shows rows labeled by source (Manual / Open-Meteo);
   the rainfall trend chart includes the satellite days.
3. Re-run the exact same ingest → same count, `SELECT count(*) FROM
   climate_readings WHERE source='open_meteo';` unchanged (idempotent
   upsert on farm/date/source).
4. CHIRPS (ClimateSERV) provider is labeled experimental: when the upstream
   API is slow/down it fails with a clean "provider unavailable" banner and
   suggests Open-Meteo — never a crash.
5. A farm with no drawn parcels → translated "draw a parcel first" error
   (centroid comes from PostGIS over parcel boundaries).
6. Cron: `pnpm climate:ingest` ingests the lag date for every farm with
   parcels across all orgs (sequential, rate-friendly, per-farm logging).

## Cycle rainfall analytics

7. **Ciclos** → cycle selector → Café 2026-A: "Lluvia acumulada del ciclo"
   shows the summed rainfall (seeded manual Apr–Jun + satellite fill;
   ~932 mm at the time of writing) with the covered range and day count.
8. Where manual and satellite rows overlap on a date, the manual value wins
   (source priority: station > manual > chirps > open_meteo) — totals don't
   double-count.
9. The timeline chart plots daily rainfall bars with ● markers on activity
   dates (tooltip shows the activity type); a cycle with no rainfall rows
   shows a friendly empty state pointing to the ingest.

## Isolation & authz

10. Ingest requires `climate:create` (field supervisors have it; the vecino
    org's farm ids are rejected in finca-demo forms and vice versa).
11. Past_due orgs cannot ingest (read-only mode blocks climate.create).

## Automated

`pnpm test` · `pnpm typecheck` · `pnpm build` — green at Phase 8 close.
