# MoneyFlow: daily money tracking and life planning

Primary loop: record a transaction, check today's planned allowance, review monthly
bills and update a savings goal. Envelopes are optional advanced tools.

## Domain language

| Concept | Meaning | Moves recorded money? |
|---|---|---|
| Expense / income | A real-world transaction explicitly recorded by the user | Yes, updates the ledger and any linked envelope |
| Recorded balance | All recorded income minus expenses, starting at zero | Derived; not a verified bank balance |
| Monthly spending plan | Overall spending limit including bills, after intended savings | No |
| Category limit (`Budget`) | Optional monthly detail inside that spending plan | No |
| Recurring bill | Monthly commitment; unpaid amount is reserved before the daily allowance | Only when explicitly paid through `ExpensesService` |
| Bill occurrence | Frozen obligation for one bill/month; remains outstanding until paid or waived | Waiving releases the reserve without recording an expense |
| Bill payment | Link to one real expense for one bill and month | Linking an existing expense does not create another |
| Savings goal | Self-reported saved amount, target and date | No |
| Allocation / envelope | A lifetime running balance for linked expense/income categories | Changes recorded allocation, never transfers money between banks |
| Unallocated pool | Recorded balance minus the sum of envelope balances | Derived; may be negative |
| Allocation movement | Explicit funding/transfer/unallocation within the recorded balance | Reallocates without changing total balance |
| Allocation funding target | Advanced monthly intent for funding an envelope | Saving a target does not fund it |

A category may be linked to at most one envelope, enforced in the database and service.
Reversals and amount edits use the expense's stored `allocation_id`, never today's link.
Envelope balances do not reset at month boundaries or determine the daily allowance.

Absent monthly plans inherit the latest earlier override. A null override clears the
limit until a newer non-null plan exists. Zero is not a substitute for absence.
Preferences, onboarding and the monthly page write through `SpendingPlanService`.

Bill templates start in the user's current month and repeat until stopped. Due dates
clamp to short months. Monthly occurrences retain unpaid debts across month boundaries
and after stopping recurrence. Deleting a payment reopens its original occurrence.
Late payment is recorded today against the original bill month. Template edits change
the current unpaid and future cycles; prior cycles are edited or waived individually.

Expected monthly income is a user-supplied reference used for income prefills and the
work-time lens. It is never a recorded deposit or spendable money.

See [ADR-0002](docs/adr/0002-daily-money-and-life-planning.md) for the architecture,
allowance formula, trade-offs and failure behavior. ADR-0001 remains background for
the advanced envelope funding target, not the primary monthly spending plan.
