# Gmail bank import

## Requirements and evidence

The user wants bank transactions added to MoneyFlow without keeping a computer
running or forwarding messages. Gmail is the selected source. Read-only inspection
confirmed transaction emails from Krungthai NEXT and SCB Easy, including HTML and
nested MIME bodies. Some SCB emails arrived about two hours after the transaction.
No personal message, address, account number, reference or name is a test fixture.

When a user connects Gmail, the server reads supported bank notifications. When
automatic import is enabled with category mappings, newly received, authenticated,
unambiguous notifications become ledger entries exactly once. Historical mail,
possible own-account transfers, possible duplicates and unsupported fees require
review. The transaction's timestamp is used, not the email delivery timestamp.
No claim is made that banks email every transaction or that delivery is instant.

This is a multi-user feature: each MoneyFlow user grants access to their own Gmail,
chooses their own category mappings/accounts, and can only see and act on their
own imports. There is no shared personal mailbox or hard-coded address. Scheduling
orders users by last attempt so a failing mailbox cannot starve other accounts.

## Frontend

- A Gmail card in Settings: connection/configuration status, read-only scope
  disclosure, connect/disconnect, last successful sync, sync now.
- Expense/income category mappings, automatic-import switch and own-account
  suffixes used to flag potential transfers. No credentials in browser storage.
- Review detected entries in the same card, with save/ignore and clear reasons.
- Thai and English, semantic theme tokens, disabled/busy/error/empty states.

## Backend and dependency order

1. Pure MIME/parser and encrypted-secret utilities; synthetic regression tests.
2. Migration and entities for a Gmail connection and deduplicated imported mail.
3. Gmail OAuth adapter, account-owned service/controller, scheduler, app wiring.
4. Settings component, API/types/i18n, operator documentation and example config.
5. Compile both workspaces; exercise API, ledger balances and UI against a
   disposable database with a mocked Gmail transport. A real OAuth grant to the
   deployed MoneyFlow client remains an operator setup step.

The server uses a dedicated Gmail OAuth client with gmail.readonly, offline access,
single-use expiring state and PKCE. Callback redirects only to a configured frontend;
the short-lived code travels in the URL fragment and is cleared immediately. The
frontend completes the exchange with the initiating user's JWT. Another user's
JWT cannot complete or consume the state, preventing account-linking CSRF.
Refresh tokens and PKCE secrets are encrypted with AES-256-GCM and bound to the
MoneyFlow account. OAuth tokens, raw MIME bodies and recipient identities are not
returned or logged. Normal Google sign-in is a separate feature and grants no mail
access. Gmail's scope covers the mailbox; application filtering narrows processing
to allowlisted bank senders/subjects, it is not a bank-only OAuth permission.

Sync uses bounded, paginated received-time windows and a database lease. Retry does
not advance an unfinished window. Source message IDs and transaction-reference
hashes prevent replay, including reconnects. Ledger mutations use ExpensesService
inside the existing account ledger lock. Disconnect cancels in-flight work and
removes local credentials; account reset also disconnects. Gmail is never modified.
No message content is sent to an AI service.

## Security checkpoint

- JWT and account ownership on every user operation; global request validation.
- Only OAuth callback and constant-time-secret-protected scheduler dispatch public.
- Fixed Google endpoints; no user-supplied fetch URL or OAuth redirect.
- Exact sender/subject checks and Gmail authentication results; fail closed on
  unauthenticated, ambiguous, oversized or unrecognized content.
- No HTML rendered from email. Only minimal parsed fields are stored.
- Background failures use bounded codes, never provider errors containing secrets.
- Disable feature cleanly when required server configuration is missing.
- Public use of Gmail restricted scopes requires Google's applicable verification;
  testing-mode refresh-token expiry and serverless scheduling documented.

## Scope boundaries

This version targets the observed Krungthai transfer and SCB transfer/PromptPay
receipt templates. Statements/PDFs, OTP, promotions, investment statements, loans,
card purchases and other templates are not guessed into transactions. Identifying
all own-account transfers depends on account configuration; possible matches stay
for review. The discontinued LINE experiment is not part of this feature.

## Sources

- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/workspace/gmail/api/guides/sync
