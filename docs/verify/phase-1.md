# Phase 0 + 1 verification

## Setup

```bash
docker compose up -d db
pnpm db:migrate && pnpm db:seed
pnpm dev
```

Demo users (password `demo1234`): owner@demo.agropeq.io, admin@demo.agropeq.io,
manager@demo.agropeq.io, supervisor@demo.agropeq.io — all members of org
**finca-demo** (Finca Demo).

## Click-through

1. Visit http://localhost:3000 → redirected to `/es` landing. Toggle Español/English.
2. Log in as `owner@demo.agropeq.io` → lands on `/es/o/finca-demo/dashboard`.
3. Dashboard shows: total cost (~4107 US$), 2 active cycles, 2 farms, 4 parcels;
   cost-by-parcel bars with US$/ha; cost by activity type; cost by month.
4. **Mapa**: all parcels render as green polygons with labels on satellite imagery
   (Matagalpa). Toggle Calles/Satélite.
5. **Fincas** → Finca La Esperanza → parcel list with computed areas (~9–11 ha each);
   mini-map shows boundaries. Create a new parcel: draw a polygon on the map
   (click points, double-click to finish) → area auto-computes on save.
6. **Ciclos de cultivo**: 2 active + 1 closed cycle listed; create one from the form.
7. **Actividades** → Registrar actividad: pick type/date/parcel/cycle, add an input
   line (product, qty, unit cost) and a labor line (workers × rate) → totals update
   live → save → appears in the list; dashboard totals increase.
8. **Cultivos**: global catalog (Café with 3 varieties, Maíz, …) + add custom crop.
9. **Productos**: 8 seeded inputs; create another.
10. **Miembros**: 4 members with roles; invite by email → pending invitation with
    copyable `/es/invite/<id>` link. Open that link in an incognito window, register,
    accept → lands in the org.
11. Switch locale to `/en/...` — every screen above is in English.

## Automated

```bash
pnpm test        # calc/costs unit tests
pnpm typecheck
```

## Tenant isolation spot-check

Log in as a user with no membership in finca-demo and visit
`/es/o/finca-demo/dashboard` → redirected to onboarding.
