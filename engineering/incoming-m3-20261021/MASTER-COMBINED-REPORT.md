# Combined M3 — local implementation and acceptance

**COMBINED PARTIAL — NOT A PRODUCTION RELEASE.** Unified current selling-price behavior is implemented and locally verified for registered, store-owned Standard and Precision products with a verified unchanged acquisition basis. The broader M3 purchase-payment/costing and device acceptance gates below remain open. Implementation checkpoint: **b82f0640**, continuing **4db62c5d**, without restarting M2/M3.

## Scope and preservation

All implementation is confined to `source-web`, `source-android`, local SQL drafts and synthetic evidence in this directory. These are isolated candidates over the sealed M2 archives, not integrations into the dirty root application. No Production/Staging database write, hosted migration, deployment, financial activation, GitHub push or unrelated feature change occurred. All 32 protected pre-existing dirty files match their preservation baseline. Eighteen currency/localization engine inputs match the M2 archives byte-for-byte. Existing Catalog, Checkout, customer records and hosted rollback/OTA artifacts were preserved.

Global Currency remains display-only: unchanged BoT/ECB/reference-rate/freshness machinery, original amounts retained, unavailable conversion not fabricated. New financial posting remains TZS-only with canonical accounting-authority verification, including revalidation when saved orders are received. No native non-TZS activation, tax engine or new treasury engine is included.

## Incoming and unified current selling price

- Canonical product IDs, names, SKU/barcode, package unit, pack size and base unit are validated; registered products are reused, not recreated. Immediate receiving rejects unregistered identities. Supplier selection uses verified records; the non-credit immediate path can omit supplier.
- Standard receiving and Precision UNIT/BOX/PACK conversion use exact decimals and one shared Products/Incoming calculator. Precision entry opens expanded automatically. Pack prices derive from the same current base-unit price. Fractional packages are supported only when their base-unit quantity is exact and whole; unsupported precision fails closed.
- Successful receiving applies stock and an edited current selling price in one transaction. Existing and newly received units use that current price. A private common trigger guards and audits price changes made by both the existing Products RPC and Incoming, including actor, product, organization/store, before/after price, timestamp and receiving event where applicable. This audit is not another stock or financial ledger.
- Actual schema ownership is `products.store_id` plus one `products.selling_price`; inventory can reference a product from another store. Such shared/global products cannot safely receive a store-only price change through this schema. Both Products and Incoming reject that change rather than reprice another store. No new store-pricing architecture was invented.
- Save Incoming Order uses canonical order/item writers and stores quantities/intended prices without changing live stock or price. Registered products require a server-validated save-time current-price expectation.
- Saved full/partial receiving uses `m3_receive_saved_v1` as a guarded idempotent wrapper around **the existing `receive_inbound_stock_partial_v1` inventory writer itself**. There is no separate saved-order inventory writer. Legacy non-M3 receiving keeps its established path. Direct shortcuts for M3 saved orders are rejected without a private transaction-bound validated batch context.
- A saved intended price is checked against the latest locked product. A subsequent partial can retain a price actually applied by that same order; unrelated newer prices cause a localized conflict. Changed saved item evidence, identity/pack metadata, cost basis, duplicate items, invalid/over quantities and unsupported currency fail closed. No silent stale-price overwrite or automatic price override is offered.
- Stable actor/order/visible-snapshot request IDs bind exact payloads. Same-request retries and concurrency resolve one receiving event; changing a payload under that request is rejected. Reloading a newly refreshed remaining-quantity snapshot creates a new explicit receiving operation, never an automatic resubmission.
- The original canonical supplier-liability behavior is retained: the existing receiver creates the outstanding order balance at first receipt and avoids another liability on later partial/full receiving. This was tested locally; it does **not** certify the broader purchase-payment/funding integration or approve its Production rollout.
- One consolidated notification and permission-projected immutable receiving receipt are produced per receiving execution, containing all received lines. Operational projections remove acquisition costs, totals and private notes on the server. A two-stage receipt has two execution receipts, rather than falsely reporting both executions as one stock event.

Automatic bulk drafts retain their scoped encrypted Web/native storage, frozen uncertain submission and exact retry. The existing legacy single-order modal is preserved; it has not gained bulk autosave. Multiple simultaneous browser-tab draft conflicts remain uncertified. Editing an already saved M3 order behind its immutable captured receiving evidence is rejected; a refreshed approved snapshot/edit workflow is not certified.

## Confirmed UI defects corrected

The installed React Native Web `Alert.alert()` implementation is empty. Saved full/partial receiving confirmations therefore had no Web action. The receiving handlers now use actual Web confirmation, retaining native Alert on Android. Definite bulk rejections restore editable state and localized price/cost errors instead of being mislabeled as uncertain posting.

Actual browser acceptance then exposed stale order-detail state: a completed full receipt still displayed the preceding partial quantities. The final candidate reloads both canonical order header and line quantities after full/partial success. Actual final UI shows `PARTIAL_RECEIVED / 6 received / 6 remaining`, then `RECEIVED / 12 received / 0 remaining`. UNIT receipts display base units without multiplying by pack size a second time.

## Staff Operational Dashboard

The old Dashboard queried store-wide sales/collections, and Money In netted expenses rather than proving personal gross collections. Failed reader dependencies left formatter readiness unset, making data-loading failures appear as conversion failures. TZS same-currency formatting itself was already correct; it was preserved.

The Staff branch now uses a narrow read-only server projection with authenticated actor, active Staff membership and assigned store. It attributes sales to the canonical seller and collections to the canonical collector, separately from personal expenses; it never infers cash from a sale header or shares store-wide/colleague totals. Missing attribution is unavailable, not zero. Response fields are allowlisted and cost/profit/liability information is absent. Workspace switching, scope/generation cancellation, bounded reads and scope-keyed date selection preserve isolation. Owner/Admin/Cashier and existing Capital Recovery branches were retained.

Genuine local Staff UI verified three orders, sales **TZS 400,000**, own gross collections **TZS 100,000**, own expenses **TZS 5,000** and average **TZS 133,333.33**, without FX availability. A verified empty day shows TZS zero. Browser session restoration and actual workspace selection were exercised. A Staff member's own legacy credit-ledger collection causes Money In to fail closed until authoritative cross-ledger linkage/deduplication is verified; colleague ledger rows do not contaminate personal totals. No refund-adjusted/net balance is asserted.

## Evidence ledger

Counts below describe final results per suite, not a sum of repeated test runs or a claim that all historical checks are unique.

| Evidence | Result | Coverage |
| --- | --- | --- |
| Preserved original Incoming PostgreSQL | 104 PASS | Prior canonical bulk/draft contract evidence retained |
| Preserved M2 PostgreSQL/compatibility | 192 / 24 PASS | Historical verified baseline, not rerun wholesale |
| STAFF-POSTGRES-RESULTS.json | 20 PASS | Personal attribution, permissions, unavailable states |
| STAFF-LEGACY-GAP-RESULTS.json | 2 PASS | Fail-closed own legacy credit collections |
| PRECISION-POSTGRES-RESULTS.json | 30 PASS | 105 mixed lines, conversion, original sale/COGS, rollback/retries |
| STANDARD-MASTER-RESULTS.json | 11 PASS | 10 old +100 new units, current price, Save/no live posting |
| MASTER-POS-ISOLATION-RESULTS.json | 13 PASS | Canonical POS prices/pack flags and cost privacy |
| MASTER-LEGACY-REGRESSION.json | 17 PASS | Affected canonical full/partial Owner/Admin, concurrency, late rollback |
| UNIFIED-PRICE-RESULTS.json | 40 PASS | Standard/Precision saved partial→full, current price, audit, replay/concurrency |
| UNIFIED-BOUNDARY-RESULTS.json | 14 PASS | Cost gate, shared stores, tamper, duplicate/over quantity, Products audit, grants |
| MASTER-API-RESULTS.json | 43 PASS | Genuine local GoTrue/direct API role boundaries and 105-line receipts |
| UNIFIED-API-RESULTS.json | 14 PASS | Genuine local saved receiving, exact retry and receipt projections |
| UNIFIED-UNIT.log | 18 PASS | Client request binding, seven-language conflicts, UNIT/BOX receipts, confirmations |
| master-incoming-unit.log | 30 PASS | Existing draft/storage/receipt model checks |
| PRECISION-UNIT.log + PRECISION-LANGUAGES.log | 17 +7 PASS | Shared calculator/quantity model and seven-language labels |
| SAVED-UI-RECONCILIATION.json | 9 PASS | Actual browser partial/full, exact quantity, canonical liability, no fabricated payment, history |
| MASTER-PDF-RESULTS.json | 14 PASS + visual PASS | Four genuine projected 105-line Arabic/Chinese PDFs |
| Final Web/Android TypeScript and exports | PASS | Exact source inputs and artifact SHA-256 maps in build descriptors |

The earlier API harness failure (`MASTER-API-INITIAL.json`) checked an event at the wrong notification field; the corrected genuine API test reads `body.event_id`. Early local SQL prototype/encoding/assertion failures were corrected and are not represented as product PASS. Source changes during provisional exports correctly prevented those artifacts being sealed. Only final descriptors with matching source inputs qualify for this package.

## Genuine runtime and PDF limits

Desktop Web: genuine local Auth, original bulk Precision entry, encrypted draft reload/unlock, confirmed immediate receiving, final-built saved partial/full, refreshed detail and original-currency receipt passed. The final saved UI reconciliation also verifies historical sale price/COGS, exactly 12 additional units and no fabricated payment. Staff genuine UI and workspace/session checks use the same unchanged Staff source as the final build.

Arabic/Chinese Owner and operational PDFs were rendered from actual permission-projected synthetic receipts, checked for all 105 SKUs and reviewed visually on first/last Owner pages and operational first pages. RTL/shaping, Chinese identities, repeated headers and final totals are readable; operational files omit cost columns. Product identities/SKUs were not translated.

**Mobile/tablet viewport runtime, physical Android, iPhone Safari and native Print/Share: NOT TESTED in this candidate.** The browser viewport override reported success but actual DOM width remained 1280, so it is not Mobile acceptance. Samsung was connected but foregrounded an unrelated user app; no isolated authenticated native test session was available and it was not interrupted. A successful Android export does not establish device usability or Arabic/Chinese native font/share behavior. Seven-language source/unit compatibility is verified; full interactive visual acceptance of every language/device combination is not claimed.

Practical next acceptance: use a dedicated local Expo test session with the same disposable fixtures and loopback backend, verify Owner/Staff scope switching and receiving, then native Arabic/Chinese Print/Share. Exercise real mobile/tablet widths and Safari through a permitted test surface. No customer financial posting is needed.

## Open gates and Owner decisions

1. **Acquisition-cost policy remains explicitly unapproved.** Different incoming unit cost fails closed. Example: old 10 units at 500 plus new 100 at 600 cannot simply set the old product cost to 600 without revaluing existing stock by 1,000. An approved authoritative costing contract is required; FIFO/weighted-average were not invented or activated.
2. **Shared/global product pricing:** approve a store-specific pricing contract before a product referenced by multiple stores can be repriced in just one. Current safe behavior is rejection.
3. **Purchase finance/funding:** full, partial and unpaid supplier settlement/payment reconciliation and funding adapters are not certified by the non-credit receiving or canonical-liability tests. New payment/funding payloads remain blocked. Existing engines were not replaced.
4. **Staff legacy collections:** verify stable collection/reversal linkage across the legacy credit and sale-payment ledgers before certifying a complete Money In figure for those cases. Missing evidence remains unavailable.
5. **Acceptance/UX limits:** physical/native and genuine responsive coverage above, legacy-modal autosave, simultaneous-tab draft recovery and revised saved-order snapshot editing remain open. This is a local review package, not permission to publish these incomplete paths.

## Packaging and stop point

`MASTER-LOCAL-MANIFEST.json` lists exact candidate source, SQL, evidence, build and archive hashes. `MASTER-LOCAL-REVIEW-SOURCE.zip` is a scoped review delta, **not a deployable Production artifact**. `MASTER-M2-PREIMAGES.zip` and its index retain verified M2 bytes for existing paths; new M3 paths are identified separately. See `MASTER-LOCAL-ROLLBACK.md`. Older progress reports and archives remain historical evidence and were not overwritten.

Local source and evidence are checkpointed. Runtime configurations, credentials and disposable fixtures remain private and excluded from the public review/checkpoint package. No security restriction was bypassed. The ancillary CIM process inventory was denied and was not retried; it was not needed to finish. Browser dialog/focus timeouts were resolved through the documented confirmation input without resubmitting a financial request. Work stops here for Owner review; no next milestone or hosted action is authorized by this report.
