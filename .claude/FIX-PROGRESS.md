# Audit fix progress — MoneyFlow

Branch `v2`, base commit `6697c04`. Full findings list is in the session transcript;
this file is the resume point so a fresh session can pick up without re-auditing.

Verify at any time: `cd backend && npx tsc --noEmit -p tsconfig.json`

## Done

- [x] **C3** `trust proxy` — `backend/src/main.ts`. Throttler was keying every user to the
      load balancer's IP, i.e. one shared 100 req/min bucket for the whole app.
- [x] **C1** SQL injection via LLM tool args — `chat.service.ts` `get_transactions`.
      `args.type` was interpolated into the WHERE clause; `x' OR '1'='1` collapsed it to
      TRUE and returned every user's rows. Now a bound param + whitelist.
- [x] **C2** `delete_transaction` / `create_transaction` chat tools now go through
      `ExpensesService` (transactional, sets `allocation_id`, reverses the envelope).
      Delete used to adjust `total_balance` only, leaving the wallet permanently short.
- [x] **H1 (partial)** timezone helpers added in `common/local-date.util.ts`
      (`monthRangePredicate`, `yearRangePredicate`, `monthSpanPredicate`, `localDayExpr`,
      `localMonth`, `shiftMonth`, `MONTH_PATTERN`) and applied across every chat tool.
      These are also sargable, which fixes P5 at the same sites.
- [x] **B9** `inv.currentValue` / `inv.gain` are produced nowhere — chat tools stopped
      reading them and now report cost/netCost with `marketValueTracked: false`.
- [x] chat tools: UUID guard on `transactionId`, `limit` clamped, no more `cats[0]`
      silent misclassification, BE→CE + zone handling centralised in
      `normalizeOccurredAt`.

- [x] **H1 all** — helpers applied across analytics (11 sites), its controller, expenses
      and the chat tools. **Proven against real Postgres**: three transactions a Bangkok
      user files as Jan/Feb/Mar were reported by the old predicate as 300/400/0 and are
      now 200/100/400. March showed zero while its spending sat in February.
- [x] **P5** — same change makes the predicate sargable. `EXPLAIN ANALYZE` on 120k rows:
      Seq Scan 33.7 ms → Index Scan 7.2 ms.
- [x] **H2** `getAllocationSummary` — dropped the fan-out join, reads the stored
      `expenses.allocation_id` (which is what recomputeBalances rebuilds from too).
- [x] **H5** `findOneForUpdate` with `pessimistic_write`, inside the transaction.
- [x] **E1/E9** reversal reads only the stored `allocation_id`; DTO `allocationId` is
      explicitly stripped rather than silently dropped.
- [x] **H3** migration `1785220000000-WalletLinkIntegrity` — unique index on both link
      tables (with duplicate collapse), CHECKs on `allocation_movements`, partial index on
      `users.reset_token`. Plus a service-side check that names the clashing wallet, and
      `ORDER BY a.id` so resolution is deterministic regardless.
- [x] **E2** wallet delete now refuses a non-zero balance (logging a movement row there
      is pointless — the FK cascade deletes it in the same transaction).
- [x] **H10** `GET /categories/:id/delete-impact` + `DELETE ?reassignTo=` so history can
      be moved rather than orphaned.
- [x] **P4** `sumAllocated()` in SQL; `loadEagerRelations: false` on the id-only reads.
- [x] **H6/H7/H8/H9/B2/B6** — `.dockerignore` ×2, prod uses the image CMD (migrations),
      `client_max_body_size 25m`, per-location security headers (**verified with curl:
      old config emitted zero, new emits all five**), real healthcheck, SSE proxy timeouts
      and `proxy_buffering off`, `$connection_upgrade` map.
- [x] **B1** `api/index.ts` rewritten to share `getCorsOptions()`, 20 MB body, trust proxy,
      promise-cached bootstrap. `npm run typecheck` + `tsconfig.api.json` now cover `api/`
      so it cannot drift silently again.
- [x] **B3** reset token stored as SHA-256. **B4/B5** DTOs for chat (4k char cap, image
      caps) and starter-wallets.
- [x] **E3** reminder grace window until 02:00 for a missed late-evening reminder.
- [x] **E4/E5** emergency fund divides by months that actually have data; wallet matched
      in SQL with anchored patterns. **E7** `@Max` on amount. **E8** category type must
      match entry type (create *and* update). **E10** upsert. **E11** loan payment lock.
      **E12** trend gap-filled to 12 whole months.
- [x] `QueryExpenseDto` — validated month/year, `limit`/`offset` (list was unbounded).

- [x] **P1/P2/P3** bundle. Measured on the real build:
      entry 398 kB + recharts 564 kB (static on entry) = **962 kB / 288 kB gzip**
      → entry **336 kB / 118 kB gzip**, nothing else static. Precache 41 files /
      2181 KiB → 15 files / **627 KiB**. ChatPanel (169 kB) and AllocationWallets
      (29 kB) are now their own lazy chunks.
- [x] 🔴 **NEW, found by running the app** — a missing `VITE_GOOGLE_CLIENT_ID` white-
      screened the entire app. `useGoogleLogin` initialises Google's token client with the
      empty id and throws from an effect; with no ErrorBoundary anywhere, React unmounted
      everything. Anyone following the README quick start hit this. Fixed by moving the
      hook into a `<GoogleButton>` that is only mounted when configured, skipping
      `GoogleOAuthProvider` entirely without an id, and adding a root `ErrorBoundary`
      (verified with an injected throw). Both cases now boot clean under Playwright.
- [x] **H4** offline queue reentrancy guard moved to a ref (the `online` listener held a
      permanently-`false` `syncing` from the first render), plus real idempotency:
      migration `1785230000000`, `expenses.client_key`, partial unique index,
      `createIdempotent()`, and the queue sends its entry id as `clientKey`.
- [x] **E13** `useFetch` — sequence-numbered runs so a slow earlier request cannot
      overwrite a newer one, and errors go through `apiErrorMessage` instead of showing
      "Request failed with status code 400".
- [x] **E6** `PrivateRoute`/`AdminRoute` refresh the profile once per load; both use
      selectors instead of subscribing to the whole store.
- [x] Cleanup: dropped `nodemailer`, `passport-local`, `workbox-window`; moved
      `@types/multer` to devDependencies; pgAdmin behind `profiles: ["debug"]`;
      `usePolling` behind `VITE_USE_POLLING`; `npm ci` in both Dockerfiles.
- [x] `AGENTS.md` updated — commands table, the `api/` note, and four new invariants.

## Verification performed

- `npm run typecheck` (src + api) and `npm run build` — clean.
- Frontend `tsc --noEmit` and `vite build` — clean.
- **nginx**: served both configs in a container and curled them. Old emitted **zero**
  security headers on the SPA route and on assets; new emits all five. Config validated
  with `nginx -t`.
- **Postgres**: old month predicate reported Jan/Feb/Mar as 300/400/0 for three
  transactions a Bangkok user files as 200/100/400. New predicate is correct.
  `EXPLAIN ANALYZE` on 120k rows: Seq Scan 33.7 ms → Index Scan 7.2 ms.
- **End-to-end** (`npm run test:e2e`, real server + real Postgres, 10 migrations on a
  fresh DB): **24/24 pass**. It caught a 500 I had introduced on every
  `GET /expenses?month=` — `take`/`skip` with `leftJoinAndSelect` needs entity property
  names in ORDER BY, not column names. Typecheck was perfectly happy with it.
- Defect re-injection: restoring `TO_CHAR` made the two boundary assertions go red
  (`feb=0 jan=1`), so they are load-bearing rather than decoration.

## Remaining

1. Frontend follow-through for the new backend contracts — these are additive, the app
   works without them:
   - category delete: call `GET /categories/:id/delete-impact` and offer `?reassignTo=`
     instead of the current bare confirm.
   - wallet delete: surface the new "still holds ฿X" refusal message.
   - History: use `limit`/`offset` (server now caps at 500/page).
2. Consider the scope question from the audit: Loans / Investments / Tax still do not
   touch `totalBalance`. Either wire them in or drop them.
