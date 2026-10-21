# Required database acceptance — NOT EXECUTED

The local PostgreSQL inspection was refused with socket error 10013. The new `2026102103-staff-operational.DRAFT.sql` has not been applied, parsed by PostgreSQL or certified. Source-level response tests are not substitutes for these tests.

Use only the preserved disposable M3 cluster after its normal approved access is available. Assert `data_directory` matches `engineering/incoming-m3-20261021/disposable`; capture existing grants/functions before applying the draft. Do not use a hosted connection or retry a refused operation through another route.

Required fixtures and assertions:

1. Owner, Admin, two Staff, Cashier, inactive member, unassigned Staff, anonymous and a foreign-organization member. Only the authenticated active Staff assigned to the requested active store may use this new contract. It accepts no target-user parameter.
2. Same employee across two assigned stores and two organizations; wrong organization/store combinations fail before reading. Same-store colleague rows remain excluded.
3. Personal completed sale, colleague sale, cashier-created sale explicitly attributed to Staff, void/cancelled sale, missing seller and conflicting seller aliases. Missing/conflicting personal attribution is unavailable, not zero or store totals.
4. Cash paid, partial credit payment and unpaid sale; exact decimal originals; average equals eligible personal sales divided by eligible order count. No money inferred from credit, unpaid totals, note text or header paid fields lacking collector evidence.
5. Verified payment receiver, receiver/creator conflict, missing receiver, unsupported payment method and late collection against an older sale. Count payment IDs once by collection timestamp; exclude duplicate aggregates and cashier settlements. Validate all actual supported mobile/bank aliases against canonical writers.
6. Trace legacy credit-ledger-v2 collection producers and any refund/reversal writers before certifying complete Money In coverage. Current draft reads only `sale_payments`, reports gross collections, and does not claim a net refund balance or full legacy-credit coverage.
7. Own expenses, colleague/Owner expenses, conflicting creators and no expense-management permission. Read permission must not grant any create/update/delete/approval privilege.
8. Empty authorized activity returns verified zeros; unavailable attribution returns null plus status. Date range follows organization timezone, including midnight boundaries. Invalid/future dates fail safely.
9. History paging across 100+ rows remains deterministic, scoped and free of costs, profit, debts, supplier balances, free-text private notes and customer PII. Totals do not change with page offset.
10. Direct API and SQL role probes must confirm existing M2 protected endpoints, tables and column grants remain denied. Compare grant/function preimages and verify no inventory/financial records change during reads.
11. Run affected Incoming notification/receipt and inventory regressions after contract application; preserve the existing 104 distinct M3 PostgreSQL PASS evidence separately.

Only after the above: genuine authenticated Desktop/Mobile/Tablet UI, organization/user switch, refresh, session change, current Web export, Android runtime/build and PDF acceptance. Device scenarios without execution remain NOT TESTED.
