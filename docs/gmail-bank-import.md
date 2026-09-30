# Gmail bank import

MoneyFlow can check each user's Gmail on the server and record supported bank
notifications without keeping their phone or computer open. Each user connects
their own mailbox from **Settings → Bank emails**, chooses their own categories,
and explicitly enables automatic recording. Connecting Google for sign-in, or
connecting Gmail to a coding assistant, does not grant this application mail access.

## What is supported

| Bank notification | Result |
| --- | --- |
| Krungthai NEXT successful outgoing transfer / PromptPay transfer | Expense |
| SCB Easy outgoing PromptPay transfer notification | Expense |
| SCB Easy incoming PromptPay notification | Income |

These are Thai templates checked against observed mail; tests contain synthetic
content only. Other templates, incoming KTB notifications, statements/PDFs, card
charges, marketing and OTP messages are not inferred. Bank email notification
settings must be enabled separately in the bank app. Not every transaction has
an email, and observed SCB notifications arrived about two hours after the
transaction. This is email-driven import, not a real-time bank feed.

The first scan covers seven days. Older received emails stay in review, even when
automatic recording is later enabled. A new email can be automatically recorded
only when its format and sender authentication pass, the source account is in the
user's account list, both account suffixes are present, and a valid category is
configured. Store all owned account and PromptPay suffixes to help detect transfers.
Only the last four digits are requested; collisions or hidden numbers need review.

Possible own-account transfers, possible duplicates, fees and unknown accounts
stay in **To review**. Users can choose a category/type and record, or skip them.
Fees are included in the recorded cash outflow. A duplicate warning requires an
explicit checkbox before a second entry can be saved. Default categories are user
choices, not a claim that the bank email identifies the expense's purpose.

## Configure the server

1. Create a Google Cloud project, enable **Gmail API**, and configure an **External**
   OAuth consent screen for users outside your organization. In testing, add test
   users; do not restrict the implementation to the site owner's email.
2. Create a **Web application** OAuth client. Add the exact authorized redirect URI:
   `https://YOUR_API_HOST/api/bank-mail/gmail/callback`. For a same-origin reverse
   proxy, use the website origin instead of a private container hostname.
3. Set these variables on the backend (or root `.env` for Docker Compose):

   ```dotenv
   GMAIL_CLIENT_ID=YOUR_WEB_CLIENT_ID
   GMAIL_CLIENT_SECRET=YOUR_WEB_CLIENT_SECRET
   GMAIL_REDIRECT_URI=https://YOUR_API_HOST/api/bank-mail/gmail/callback
   FRONTEND_URL=https://YOUR_WEBSITE_HOST
   BANK_MAIL_ENCRYPTION_KEY=BASE64_OF_32_RANDOM_BYTES
   CRON_SECRET=YOUR_RANDOM_SCHEDULER_SECRET
   ```

   Generate the encryption key with
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
   Keep it stable, back it up in a secret manager, and never put these secrets in
   `VITE_*` variables. Changing the key makes existing connections unreadable;
   users must disconnect and reconnect unless encrypted tokens are migrated.
   Google sign-in uses separate existing environment variables.
4. Build and migrate before starting the updated backend:
   `npm run build --workspace backend`, then `npm run migration:run --workspace backend`.
   `start:prod` / production Compose already runs pending migrations. The Gmail
   migration adds two tables; it does not alter existing ledger rows.
5. Deploy the frontend and backend together, and configure the backend CORS origin
   to the exact frontend origin. Missing Gmail configuration leaves the rest of the
   app usable and explains why the Connect button is unavailable.
6. Connect from the same browser session used to log into MoneyFlow. The Google
   redirect returns a short-lived authorization code via the frontend URL fragment;
   MoneyFlow clears it and completes the exchange using the initiating account's
   JWT. Changing account or losing the session requires starting the connection again.

For public users, `gmail.readonly` is a **restricted scope**. Google's verification
requirements apply; server processing/storage of restricted data also brings a
security-assessment requirement. A published frontend alone does not enable public
OAuth access. See [Gmail scopes and verification](https://developers.google.com/workspace/gmail/api/auth/scopes)
and [restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).
External apps in Testing receive refresh tokens that expire after seven days for
this scope; see [Google's refresh-token expiration rules](https://developers.google.com/identity/protocols/oauth2#expiration).

## Run automatic checks

- A continuously running NestJS server checks every five minutes. The browser does
  not have to stay open. In-process scheduling is disabled on Vercel and in tests.
- On serverless or sleeping hosts, configure an external scheduler to **POST** to
  `https://YOUR_API_HOST/api/bank-mail/dispatch` every five minutes with header
  `x-cron-secret: YOUR_CRON_SECRET`. A health ping alone does not invoke the importer.
  Use a host/request timeout of at least 60 seconds. Never put the secret in the URL.
- Each invocation selects up to ten accounts, oldest attempt first, and stops
  starting additional accounts after 15 seconds. Each account reads at most five
  messages per page; fixed scan windows and page tokens continue on later checks.
  Therefore five minutes is a scheduler cadence, not a per-user latency guarantee.
  Monitor last completed checks and pending pages; add worker capacity or trigger
  more often if the population/backlog outgrows this bounded dispatcher.
- Database leases prevent overlapping imports for an account across server
  instances. A process crash releases through five-minute expiry. Other accounts
  continue after a mailbox failure. Revoked grants require user reconnection.
- Successful windows overlap by two days to catch delayed indexing. Gmail page-token
  failures restart the same window; deduplication makes replays safe. Long outages
  resume from the last completed window rather than losing the gap.

## Isolation and data handling

All user endpoints require JWT. State, connections, categories, entries and ledger
locks belong to the current MoneyFlow user. A mailbox address can differ from the
MoneyFlow login address; access must still be granted by that mailbox's owner.
The service does not accept a target user ID from request bodies.

Google grants read-only access to the mailbox, not a special bank-only permission.
The app narrows its queries to known bank senders and subjects and checks Gmail's
DKIM/DMARC authentication results. It never modifies Gmail, follows email links,
downloads attachments, renders email HTML or sends content to AI. Stored fields
are the connected email address, encrypted OAuth credentials, transaction amount,
time, bank/account suffixes, review state, and hashes for source/reference matching.
Raw bodies, full account numbers, names and raw bank references are not persisted.
Application logs contain bounded failure codes only. Configure gateway/request
logging to redact OAuth callback query strings, completion request bodies, bearer
tokens and cron headers; this code cannot control hosting-provider logs.
Frontend performance telemetry strips query strings and fragments before sending
route URLs, so OAuth completion codes are not included in those metrics.

Disconnect removes local credentials and attempts Google revocation. A failed
remote revocation is shown to the user with instructions to remove access through
their Google Account. Revocation may affect other grants using the same Google
project. Existing recorded and reviewed entries stay available. Factory reset
disconnects locally and deletes that user's import records; the Google grant can
also be removed from Google Account settings. Clearing only ledger transactions
keeps import fingerprints so old mail cannot silently recreate deleted entries.

## Endpoints

`/api/bank-mail`: `GET status`, `POST connect`, `POST complete`,
`DELETE connection`, `PUT settings`, `POST sync`,
`GET entries?status=pending|saved|ignored&offset=0`,
`POST entries/:id/save`, `POST entries/:id/ignore`.
Only `GET gmail/callback` and cron-secret-protected `POST dispatch` are public.

## Verification

```powershell
npm run test:bank-mail --workspace backend
docker run -d --name moneyflow_mail_db -p 127.0.0.1:15436:5432 -e POSTGRES_DB=moneyflow_mail_test -e POSTGRES_USER=expense_user -e POSTGRES_PASSWORD=mail-local-only postgres:16-alpine
npm run test:bank-mail:e2e --workspace backend
```

If the named test container already exists, start it instead of creating another.
The integration script verifies the database name before deleting its synthetic
test accounts. It uses a real PostgreSQL schema, NestJS API and Chromium browser;
only Google calls are stubbed. It checks two users, ownership/validation, OAuth
replay and cross-account completion, ledger effects, duplicate handling, concurrent
sync/disconnect, dispatch order, account reset and Settings placeholders. Browser
screenshots go under ignored `frontend/.smoke/ux-artifacts/bank-mail/`.

Local validation: 10 parser/crypto tests, 13 real DB/API/browser scenarios, both
workspace builds, backend API typechecking, and existing schema/CORS regressions
passed. Browser checks used Thai on a 390 px dark screen and a 1440 px light screen.

Deployment acceptance still needs a real grant to the deployed OAuth client and
a real bank email, followed by a scheduler invocation with the browser closed.
No deployed credential, production migration or real automatic ledger import was
performed by these local checks.
