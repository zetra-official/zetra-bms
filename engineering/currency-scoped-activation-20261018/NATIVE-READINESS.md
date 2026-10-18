# Currency mode readiness — bounded use of accepted evidence

The completed migration 1802 milestone is not reopened. Sources reused: global-currency-20261018/GLOBAL_CURRENCY_IMPLEMENTATION_AUDIT.md and CURRENCY_DATA_AND_FX_CONTRACTS.md, plus the accepted 1802 Production postflight and local 94/24/37 results. Only new gateway dependencies and client call sites were changed/tested.

| Contract | TZS scope | Non-TZS native status |
|---|---|---|
| Product pricing | Existing catalog numeric contracts unchanged | No verified immutable currency context across pricing |
| POS/checkout/sales | Existing canonical posting unchanged; new onboarding gateway does not post | No accepted end-to-end native denomination/posting proof |
| Stock valuation/COGS | Existing rules unchanged | Historical/transaction currency context incomplete |
| Credit/repayments | Existing canonical operations unchanged | Original/accounting/tender denomination not verified throughout |
| Expenses | Existing numeric records unchanged | Per-record historical currency provenance incomplete |
| Cash/Bank/Mobile Money | No balances/movements changed | Native multi-currency balances/settlement not activated |
| Cashier closing | Existing reconciliation unchanged | Cross-currency closing/reconciliation not accepted |
| Business statements/reports | Legacy figures retained, warning on unbound conversion | No safe historical relabelling based on current org settings |
| Receipt/PDF | Existing rendering preserved | Output currency may reflect formatter/KV; native record provenance not proven |
| Offline/sync | Existing queue/posting unchanged | SaleQueueItem payload lacks authoritative immutable currency/rate snapshot |
| Field Procurement | Existing TZS behavior preserved | workspace.tsx has currency TZS; history.tsx hardcodes TZS formatting |
| Subscription billing | Existing platform billing separate | Not a business-accounting currency contract |

Concrete current evidence: src/ui/money.ts reads organization-scoped KV and explicitly documents display-only formatting; src/offline/salesQueue.ts defines the legacy queued sale payload; app/(tabs)/sales/checkout.tsx uses conversionQuote/money currency for display, not proof of transaction denomination; app/(tabs)/field-procurement/workspace.tsx:99 and history.tsx:83 retain TZS. These examples support preserving the existing non-TZS block; no new broad audit was performed.

Modes:
- A: TZS-only new-organization confirmation through the proposed gateway. Same canonical TZS transaction engine; this package does not certify every legacy financial workflow anew or change historical values.
- B: USD/KES/UGX and all non-TZS native onboarding rejected by the NEW gateway and the scoped client capability regardless of the feature flag. No claim that old administrative APIs were globally removed or all existing organizations are TZS. Existing Owner currency authority is unchanged.
- C: Informational display conversion remains separate and requires verified source currency/rate evidence. Unbound historical values remain unconverted. Reference rate coverage is limited; no fabricated TZS/KES/UGX rates or new provider activation.

No universal native-currency release readiness is claimed. Real authenticated onboarding, physical Android/mobile, current seven-language rendered layouts and PDF acceptance were not executed in this local milestone. Existing accepted rendered evidence is retained, not rerun or relabelled as new acceptance.
