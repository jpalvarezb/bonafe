# Work-order offline completion verification

Setup as in phase-1.md. As phase-3.md notes, the service worker (offline page
cache) is only generated in production builds (`pnpm build` uses `--webpack`);
the outbox itself works in dev — only page caching needs the SW. Log in as
**supervisor@demo.agropeq.io** (field_supervisor role, has `work_order.complete`)
on **finca-demo**.

## Setup: get a completable work order

The demo seed doesn't ship a work order in `assigned`/`in_progress` state.
Create one first, as owner/admin/manager (any role with `work_order.create`):

1. Log in as **owner@demo.agropeq.io** → **Órdenes de trabajo** → "Nueva orden
   de trabajo": title "Fumigación lote este", assignee "Samuel Supervisor",
   checklist "Revisar aspersores" / "Cargar producto" (one per line) → Crear.
   Because it has an assignee, it's created directly in **assigned** status.
2. Log out, log back in as **supervisor@demo.agropeq.io** → **Órdenes de
   trabajo**. The new order shows the offline-capable completion card in
   place of the plain checklist buttons and "Completar" button (those still
   render normally for roles/rows this task didn't touch, e.g. draft orders
   or the assign/start/cancel buttons alongside it).

## Offline completion round-trip

3. DevTools → Network → Offline (or airplane mode on a real device).
4. Check both checklist items on the card — they toggle instantly
   client-side; no network call is required to see them checked (the
   incremental per-item save is skipped while offline, by design).
5. Click "Completar". A pending chip appears
   ("Se guardó en este dispositivo y se sincronizará al recuperar
   conexión.") both on the card and via the page's pending-entries list.
   The page does not navigate or crash.
6. Go back online. Within seconds the outbox flushes: the pending chip
   clears, the page refreshes, and the order now shows status **Completada**
   with both checklist items checked (grey/struck-through, no longer
   togglable).
7. **DB check**: `SELECT status, config FROM work_orders WHERE code =
   '<code from step 1>';` → `status = 'done'`, `config->'checklist'` shows
   both items with `"done": true`.
8. **Audit check**: Settings → Auditoría (owner/admin only) → filter
   `work_order.` → a `work_order.status` row for this order, `to: "done"`,
   actor = Samuel Supervisor, appears exactly once.

## Rejected path: stale cached page vs. a since-cancelled order

Demonstrates a per-item reject that lands in the sync tray without losing
the captured work, per the existing four flows' behavior.

9. Create a second assigned work order (owner, as in step 1) and open its
   row as the supervisor — leave this browser tab open (simulating a stale
   cached page: the client only knows what it fetched at load time).
10. In a second session/tab (or as owner), cancel that same work order via
    its "Cancelar" button.
11. Back in the stale supervisor tab: go offline, check the items, click
    "Completar" → pending chip appears (the client only validates the
    checklist locally, so it can't know the order was cancelled server-side).
12. Go back online → the outbox flush rejects the item (server: `invalid
    transition cancelled -> done`). The pending chip clears and **Problemas
    de sincronización** (sync-issues tray) lists a "Completar orden de
    trabajo" entry with that error message. Discarding it removes the entry;
    the work order stays cancelled — no partial/incorrect write happened.

## Exactly-once under replay

13. Complete a third assigned work order online normally, capturing its id
    and code.
14. With the outbox entry still visible in IndexedDB (or by re-issuing the
    same `/api/sync` POST body 5 times — same `outboxId`/payload), flush 5
    redundant times in a row (spam the "Completar" flow's retry, or the
    pending badge, or POST the identical batch to `/api/sync` 5×).
15. `SELECT count(*) FROM work_orders WHERE id = '<id>';` → 1 row, `status =
    'done'` (the first flush transitions it; every replay hits the
    `status === "done"` no-op branch and re-returns the same row without a
    write).
16. `SELECT count(*) FROM audit_log WHERE action = 'work_order.status' AND
    entity_id = '<id>';` → exactly 1 (the sync route only writes the audit
    row when `completeWorkOrder` reports `transitioned: true`, which is only
    true on the first, real transition). Strictly: duplicates are impossible,
    but the audit is at-most-once, not exactly-once — it runs after (outside)
    the completion transaction and `audit()` is best-effort, so a crash
    between commit and audit leaves a `done` order with no audit row, and
    replays (`transitioned: false`) never retry it. That's the accepted
    failure mode for audit writes everywhere else in the app too.

## Automated

`pnpm test` · `pnpm typecheck` · `pnpm build` — green (36 pre-existing +
14 new: 6 `workOrderCompletePayload` schema tests, 8 `mergeChecklistCompletion`
pure-merge tests).

An empirical service-level check (`completeWorkOrder` called directly against
seeded/created demo data via a throwaway `tsx` script, not committed) verified:
assigned → done transitions correctly with `transitioned: true`; an
immediate replay returns `transitioned: false` with status unchanged; and
completing a cancelled order throws `invalid transition cancelled -> done`.
