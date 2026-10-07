# Personal category codes in bank memos

## Acceptance and rules

- Users may set one optional code per expense or income category in Settings.
  `#กิน`, `#f`, or `#1` in a supported bank memo selects that category. Ordinary
  memo text without a code keeps the configured default category.
- Codes contain 1–20 letters/numbers/combining marks, hyphens or underscores,
  starting with a letter/number. Normalize NFC and lowercase; accept an optional
  leading # in the settings form. Empty/null removes the code. Codes are unique
  across both category types within one user, never across users.
- Match whole hashtag tokens only, not substrings or URL fragments. Unknown codes,
  multiple distinct codes, and a category of the wrong transaction type require
  review with no silent fallback. Repeated identical codes count as one.
  Memos near the parser's 400-unit limit also require review: a code may have
  been truncated, or an additional conflicting code lost past that limit.
- A code does not bypass existing transfer, fee, duplicate, account or historical
  mail review rules. Do not infer transaction direction from the category code.
- Keep the memo in the note unchanged. Do not change fingerprints, reimport mail,
  or reclassify saved expenses. Pending hints use current category settings; an
  explicit review choice wins. Deleting a category removes its code.

## Implementation order and files

1. Backend schema + category entity/DTO/service: nullable memo_code, unique user/code
   index, validation and conflict response; serialize edits with ledger imports.
2. Backend memo-code utility and bank-mail service: deterministic matching, apply
   before the default category on ingest, add per-entry hints on the paginated
   review endpoint (one category query per page, no N+1). Use ExpensesService.
3. Frontend types/API, Settings category form with validation/error/retry and code
   badges, bilingual instructions, then bank-email hints and review selection.
4. Unit matcher tests and isolated Postgres/API/browser tests: ownership, strict
   validation, concurrent uniqueness, automatic/manual imports, safety gates,
   delete/rename, explicit override, reload persistence and mobile/desktop UI.

## Security and deployment

Existing JWT guards and rate limits apply. Scope lookups by authenticated user;
never accept a user ID from the request body. Parameterize database writes, enforce
uniqueness in Postgres as well as API validation. Render codes/memos as React text.
Keep provider/auth diagnostics without logging memo content. Tests use synthetic
mail and a disposable database. Run the migration before deploying the backend;
no new permissions, dependencies, environment variables or Gmail access needed.
