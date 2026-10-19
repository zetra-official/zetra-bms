# Proposed actor: identity verified, canary HOLD

Production lookup matched the exact Owner-proposed email once. Auth UUID: **bb2d6dee-773d-4fa7-8fda-1eb85bbad2cd**. Email confirmed, email provider, authenticated role, nonanonymous, not deleted, no current ban. No password, OTP, session token or Auth credential selected.

This is not verified as a dedicated training-only identity. Administrator/user purpose markers are absent. Six memberships exist: active Owner 2, Staff 2, Cashier 1; inactive Admin 1. Forty stores exist across its member organizations; that count does **not** mean it has permission to all forty. Actual store-scoped RLS access was not impersonated or exercised.

Bounded read-only EXISTS checks confirm sales, sale_payments, inventory, stock_movements, expenses and cashier_shifts in those organizations. field_wallets presence is false in this particular organization scope, not proof of no other financial records. No amounts, transaction details, customer rows or organization names exported. Existing records must all be treated as protected; whether they are training records cannot be determined from these facts.

**Readiness: BLOCKED — training-only use and exact canary scope are not verified/approved.** No canary grant, enrollment, organization/store creation or deployment performed. Installed controls remain disabled; existing memberships and records unchanged.

Recommended Owner action: identify a genuinely dedicated noncustomer Auth account, or explicitly attest that this identity is approved for controlled testing despite its existing memberships and approve only creation of one separately labelled new synthetic TZS organization/store. Do not authorize alteration/deletion of its existing organizations. No credentials needed in chat. The clean dedicated identity is preferable for isolation and release acceptance.

CANARY-ACTOR-PENDING.json is a nonexecutable preparation record, not an activation approval. Expiry is calculated at future activation, never prestarted. Same persistent request ID and exact test inputs must be retained for all acceptance retries. Current installed controls enforce actor/expiry/TZS and core idempotency per request; **they do not enforce a lifetime one-organization quota across arbitrary new request IDs**. The max-one acceptance limit must not be described as a server quota. If server-enforced one-intent enrollment is required before enrollment, prepare a separately reviewed minimal binding patch; no change to the approved SQL is permitted under its old checksum.

Safe local currency certification is complete for this continuation (1,423 helper/catalog checks); native financial posting remains uncertified for the documented contract/precision reasons. No previously accepted suites repeated for this account inspection.
