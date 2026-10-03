# Home cumulative balance and bank memo

## Scope and acceptance

- Show recorded income minus recorded expenses across all months in the Home hero,
  next to monthly spending, in both track-only and planning modes. Keep zero and
  negative balances visible; this is recorded cash flow, not a bank balance or allowance.
- Persist `showCumulativeBalance` per account with a database default of false for
  existing and new users. Settings > Appearance saves immediately; failures leave
  the switch unchanged with an error. Account factory reset turns it off again.
- Read the optional KTB `บันทึกช่วยจำ` field as bounded plain text. Show it in bank
  import review and put it first in the expense note, retaining source/fee metadata.
  Existing imports without a memo remain valid; no reimport or historical overwrite.

## Implementation order

1. Backend: migration/entity, preferences validation/profile/reset, and daily brief.
   Reuse transactionally maintained `User.totalBalance` already read for the brief;
   return `cumulativeBalance: null` while hidden. Do not change spending-plan math.
2. Independently update parser/import saving: optional `memo` (400 UTF-16 units),
   one labeled line only, blank omitted, duplicates rejected. Keep reference hashes
   and fingerprints unchanged. Combined expense notes stay below 500 units.
3. Frontend types, bilingual copy, Settings switch and Home row, then import memo
   preview. Existing auth/JWT ownership applies; no new public endpoints or secrets.
4. Test defaults, strict boolean validation, user isolation, all-month ledger edits,
   zero/negative values, reset, settings persistence/error handling and both Home modes.
   Test HTML/plain memo parsing, optional/empty/duplicate/bounded memo, unchanged
   deduplication, real DB auto/manual imports, and escaped browser rendering.

## Security and rollout

User ownership comes from JWT; preference DTO accepts only booleans, not null or
strings. Mail authentication and amount validation stay unchanged. Store only the
selected memo, not raw email bodies; render memo as React text, never HTML. Tests
use synthetic mail and a disposable PostgreSQL database. Update privacy copy to
describe stored memos. Run the new migration before deploying the backend; no new
environment variables. Older frontend clients tolerate the additive fields.
