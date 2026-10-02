# Store Allocation Plan as an explicit value, not derived from movement history

**Status**: accepted

The system already computes `fundedThisMonth` per wallet by summing `AllocationMovement` rows for the current calendar month (analytics.service.ts), so a "last month's split" figure was technically free to derive — no new storage needed. We chose to introduce a separate `Allocation Plan` value per (wallet, month) instead.

Reason: `AllocationMovement` mixes every reason money entered a wallet — the planned monthly split, plus any ad-hoc mid-month top-up or inbound transfer. Deriving "last month's plan" from that sum would silently fold one-off top-ups into next month's suggested default, which the user did not intend as their recurring split. An explicit value avoids this, at the cost of a second "monthly amount" concept existing in the schema alongside the movement log (and alongside the pre-existing, unrelated `Budget` entity — see CONTEXT.md's flagged ambiguity).

Scope is deliberately narrow: the plan value has no standalone editing screen. It is only ever written when the user confirms the "Apply Last Month's Plan" distribute action, using whatever amounts were in the form at confirm time.

The plan is a **target total for the month**, not an additive amount. If a wallet was already topped up this month through the regular single-wallet fund button, "Apply Last Month's Plan" prefills only the remaining gap (`plan − fundedThisMonth`, floored at 0) for that wallet, so ad-hoc top-ups aren't double-counted on top of the plan.

The whole batch is atomic and validated against the Unallocated Pool up front: if the prefilled (or edited) total exceeds what's actually available, the confirm button stays disabled rather than partially applying or auto-scaling amounts down. This matches the existing single-wallet `moveToAllocation` guard, which already rejects funding beyond the unallocated balance.
