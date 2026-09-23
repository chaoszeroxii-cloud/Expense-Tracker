# Everyday MoneyFlow

The daily loop is **open → understand today → record → leave**. The interface uses a
cool neutral surfaces, teal actions, Thai-capable typography, and generous
spacing. Financial status still uses text as well as color.

Dark mode uses ink and slate surfaces with mint accents. Adjacent planning cards and
the home detail columns stretch to a shared lower edge; their content remains responsive.
The MoneyFlow mark combines a wallet with a rising arrow: recording money and moving
toward a goal. Its editable master is `frontend/public/app_icon.svg`.

Loading placeholders reveal once after a short delay, without a repeating pulse. A
same-query refresh retains the existing cards and in-progress forms. Changing month,
account or timezone hides the old query immediately, and late responses cannot overwrite
the current results. The saved theme is applied before React starts, including offline.

## Destinations

| Destination | Purpose |
| --- | --- |
| Home | Today's planned allowance or recorded spending, quick capture, recent entries, seven-day check-in |
| Add | Amount + category; today by default; optional note/date; save or save and continue |
| History | Monthly totals, search by category/note/amount, edit, delete and export |
| Spending plan | Monthly limit, recurring bills and savings goals; category limits as optional detail |
| Tools | Assistant, work-time calculator, reports and settings; advanced finance is opt-in |

Repeat shortcuts copy a recent expense into a **draft for today**. They never create
a transaction until Save is pressed. Amounts, notes and categories remain editable.
No plan means no invented allowance. A daily allowance is explicitly a plan, not a bank
balance. Seven-day check-ins have no punitive streak reset.

Bills are included in the monthly limit and reserved before the daily allowance is
calculated. Paying explicitly records an expense; an already recorded expense can be
linked without creating another. Savings goals track self-reported progress and a
target date; they do not move money. Envelopes live in advanced tools with an explanation
of their recorded balance, and no longer add another plan section to Home or Plan.
See [ADR-0002](adr/0002-daily-money-and-life-planning.md) for the exact rules.

The existing accounting services and schema remain authoritative. PostgreSQL decimal
strings are normalized by the expense-list API client. History's month totals come from
the analytics endpoint rather than summing the capped list. Search filters the loaded
month's entries (the existing API limit is 500).

## Verification

- Frontend production build and backend typecheck/build.
- Existing backend e2e suite against a disposable PostgreSQL database.
- Planning API and browser suites: `npm run test:planning --workspace backend` and
  `npm run test:planning --workspace frontend`.
- `cd frontend; npm run test:daily-flow`: two independent browser contexts exercising
  repeat drafts, save-and-continue, Undo, API balances, history search/decimal totals,
  no-spend check-in, track-only → plan, advanced preferences, Thai/English, light/dark,
  320/390/1440px layouts, and explicit server-failure/retry states.
- Screenshots and test traces are saved to the ignored `.smoke/ux-artifacts/` folder.
  Temporary preview scripts are removed after visual review.

The browser test requires Playwright (also used by `test:smoke`), its Chromium browser,
and a real frontend/backend. `UX_WEB_URL` defaults to `http://localhost:5173` and
`UX_API_URL` to `http://localhost:3099/api`. Use the disposable database instructions in
`backend/.e2e/README.md`, then start Vite with `VITE_API_URL=http://localhost:3099` and
allow `http://localhost:5173` in the backend's CORS origins. Tests create isolated test
accounts; do not run them against a live database. The normal API rate limit remains
enabled, so leave a minute between repeated full runs.

Usability is verified through implemented flows and visual checks. Daily retention and
real users' task completion times still need observation; the design does not claim a
measured improvement to those outcomes.
