# Daily companion expansion

Authorized scope: correct coverage/report semantics and complete history search; pinned
capture templates, batch/backdated entry, actionable bill reminders and weekly review,
goal simulation, CSV/receipt draft import, and optional payday-based spending plans.

## Implementation groups

1. Data and APIs: additive migration; capture templates and atomic reviewed batches;
   owned day reviews; server-side search and pagination; safe receipt extraction reusing
   the configured vision provider; cycle planning and persisted reminder preferences.
2. Consistent calculations: explicit reviewed days gate comparative advice; exclude bill
   payments from ordinary-spending comparisons; use effective dated plans and calendar
   days. Payday plans replace the daily allowance basis only when explicitly enabled.
3. UI: keep Home/History/Plan/Tools navigation. Pins live beside repeat capture; batch and
   import share one editable review screen. New controls are folded into relevant screens.
   Goal simulations are read-only until an explicit confirmation updates the goal date.
4. Verification: backend/frontend builds, real Postgres API and browser regressions,
   duplicate/retry/ownership/error paths, month-end/payday arithmetic, import validation,
   mobile/light/dark review. Existing daily/planning flows must still pass.

## Invariants and security

- Global JWT guard and rate limits apply. Every row/query is scoped to the caller;
  category type/ownership is checked before writes. SQL uses bound parameters.
- All financial writes use ExpensesService inside one user-locked transaction. Batches
  are capped at 100 rows, have per-row UUID retry keys, and reject unacknowledged likely
  duplicates. A preview never creates a transaction. Edited retries cannot reuse a key.
- CSV is parsed as text, never evaluated. Images are bounded and validated; receipt
  extraction has no tool calls, uses the existing AI spending guard, and returns a draft.
  Users see that image analysis uses the configured AI service before submitting.
- Day reviews mean self-reported review, not independently verified complete spending.
  No-spend, recorded activity, unknown days, and reviewed days have different meanings.
- Notification opt-in, snooze, and duplicate dispatch guards are persisted. Opening a
  reminder cannot mark a bill paid. Push requires existing VAPID/device setup; in-app
  reminders work independently. Future bills never become expenses automatically.
- Payday plans and simulations never imply bank balances. No automatic bank connection,
  transfers, or investment recommendations are introduced.
- Additive migrations own schema. Factory reset clears new user content. Existing ledger
  rows are preserved. No production deployment or live-data import is part of verification.

## Implemented decisions

- New features use the existing navigation: pins on Home, import in one `/capture`
  workspace, review from Home/weekly report, and current bill/payday actions in Plan.
- An enabled payday plan is primary. Monthly figures are a folded reference, and
  track-only mode disables payday planning without deleting its saved configuration.
- Bill pushes are one digest per user/local day, claimed with the ledger lock across
  concurrent sweep workers. Deep links open a bill action without recording payment.
- Review is inspectable for 91 inclusive dates (today plus 90 previous days); the quick
  picker shows the two weeks used by the weekly report. Undo also clears no-spend status.
- Tests use real authentication, PostgreSQL, financial services and browser forms.
  Only OCR/vision recognition and push transport use stubs; live accuracy and delivery
  require the operator's configured provider/device and are not claimed here.

## Verification outcome (2026-09-30)

Backend build/typecheck (including the serverless entry), frontend build/typecheck and
`git diff --check` passed. The companion suite passed 38 checks. Existing planning and
daily browser suites passed 10 and 19 checks, the planning API suite passed 29 assertions,
and daily allowance unit tests passed 3 cases. Thai layouts were inspected at 390/1440px
in both themes after data and fonts loaded. Evidence is recorded in
`docs/audits/2026-09-30-daily-companion.json`; images remain in ignored local artifacts.

The additive migration was verified in the disposable database. No migration was
applied to a live database. The existing html2canvas bundle-size warning remains.
