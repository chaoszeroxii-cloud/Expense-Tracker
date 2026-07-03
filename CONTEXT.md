# MoneyFlow Expense Tracker

Personal envelope-budgeting expense tracker. Users record income/expenses, and split money into named "wallets" (envelopes) that track their own running balance.

## Language

**Allocation (ซอง / Wallet)**:
A named envelope with a running `balance` that accumulates over the account's lifetime — it never resets on a calendar boundary. Funded by moving money in from the Unallocated Pool, or automatically credited/debited when an Expense's category is linked to it.
_Avoid_: Envelope (UI-only synonym; code and API use "Allocation")

**Unallocated Pool (เงินรอจัดสรร)**:
`user.totalBalance − Σ(allocation.balance)`. Real money the user has that hasn't been assigned to any wallet yet. Can go negative ("over-allocated") if an expense drains `totalBalance` without a linked wallet to drain alongside it — see [[project_envelope_balance]].

**Distribute (แบ่งเงิน / แบ่งเข้าซอง)**:
The act of moving money from the Unallocated Pool into one wallet (`moveToAllocation`). Always a real, immediate movement of real money — never virtual/planned money.

**Allocation Movement**:
An immutable log entry (`fund` / `transfer_in` / `transfer_out` / `unallocate`) recording one real money movement into or out of a wallet. This is transaction history, not a plan.

**Allocation Plan** *(new)*:
An explicit, editable **target total** stored per (wallet, month) — "how much I intend this wallet to hold from this month's funding, in total." Distinct from Allocation Movement: a plan is *intent*, not a record of money that actually moved. Only ever written as a byproduct of the "Apply Last Month's Plan" distribute action (no standalone planning screen exists). Carries forward as the prefill default for the following month.
Because it's a *total*, applying it tops each wallet up to the plan amount — it prefills `plan − fundedThisMonth` (floored at 0), not the full plan amount, so money already funded this month by other means isn't double-counted.
_Avoid_: Budget (a different, pre-existing concept — see flagged ambiguity below)

**Expected Monthly Income (เงินเดือนที่คาดว่าจะได้)**:
A single reference number the user sets once (in Settings). Used only to prefill the amount field when manually recording a new income transaction. Never substitutes for real recorded income anywhere else — the Unallocated Pool and Distribute flow always use real money only.

**Budget** *(pre-existing, unrelated)*:
A per-(category, month) planned spending amount compared against actual expense totals in that category (see `Budget` entity). Operates on **expense categories**, not wallets, and has no relationship to Allocation Plan — the two "monthly amount" concepts are intentionally separate because a category can span multiple wallets and vice versa.

## Flagged ambiguities

- **"Plan" is overloaded.** `Budget` (category-scoped, spend-tracking) and `Allocation Plan` (wallet-scoped, funding-intent) are both "a monthly planned amount" in plain conversation but are unrelated entities serving different questions ("did I overspend this category?" vs "how do I want to split my income this month?"). Always qualify which one you mean.

## Example dialogue

> **Dev**: So when the user hits "Apply Last Month's Plan," where does the money come from?
> **Domain expert**: The Unallocated Pool — real money only. If last month's Allocation Plan totals more than what's sitting in the pool right now, the button stays disabled until they either record more income or edit the numbers down.
> **Dev**: And does that touch the Budget page at all?
> **Domain expert**: No. Budget tracks category spend against a category-level target. Allocation Plan is purely "which wallet gets how much of my income" — different axis entirely.
