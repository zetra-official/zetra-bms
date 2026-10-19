# Catalog-only customer release — ready for exact Owner approval

No deployment has occurred. Main application change remains the one-line Catalog hotfix incc03b36. Global Currency financial checkpointbcc0ac9 is excluded.

## Scope and evidence

Only app/catalog.tsx Generate Code payload changes p_store_id from activeStoreId to null. The organization ID, explicit selected product IDs, cost/selling-price consent, expiry and use limits are preserved. The canonical generator validates every selected product against its organization. Import still validates target organization membership, selected shared products and target-store ownership. This supports organization-level catalog products rather than imposing an unrelated active-store filter.

Owner's accepted114-product Expo result is retained, not rerun. Fresh focused disposable PostgreSQL checks:15 Catalog lifecycle/isolation/cost tests plus3 staff/anonymous authorization checks PASS. The exact three read-only Production RPC definitions were used locally. No Production share code was generated and no products were imported by automated tests. Existing source TypeScript/guard/Web checks are reused; isolated Android/Hermes export PASS. There is no database migration or financial activation.

## Web

Exact271 artifacts remain hash-identical to the accepted isolated Web build. Site40a9e840-5437-480e-bc63-8391d6d0ef24 still serves app.zetra.tz from ready deployment6ad49c64c2acd6e0352f242f, which is the rollback target. No unfinished native financial RPCs are in the Web bundle. The new Catalog release must use the official draft/upload/smoke/publish workflow and stop on baseline drift.

## Actual installed Android delivery

Read-only extraction of the connected device's installed com.anonymous.zetrabmsclean APK proves Expo Updates enabled, ZETRA project update URLa8536709-2bea-40f4-8dd7-01563bd08c70, production channel, runtime resource1.0.0, ALWAYS update checks and launch wait0. Existing EAS production-apk distribution also uses production/runtime1.0.0. No native configuration, signing or dependency change is needed for this TSX patch.

Fresh EAS inspection identified current Android update01a14bd2-bbe2-7d84-b0cd-154911b0a21e, group9ae993b5-1566-41ea-821c-3cc94dce0151. Although its Git metadata records a dirty tree, the preserved dist Android Hermes file matches the published launch asset SHA exactly. Its paired source map contains all original sources. Application source was reconstructed from this evidence, dependencies matched their original sourcesContent, and every raw application asset matched the published asset hashes.

Final candidate comparison covers1,722 source modules: all module source content unchanged except app/catalog.tsx and the generated route context's isolated absolute directory prefix. The route keys/expressions are unchanged. All published native asset hashes are unchanged. Candidate has no create_native_sale_v1/create_native_expense_v1/original-reader RPC additions. It is not the current mixed main working tree. Private maps and installed APK are excluded from release artifacts and Git.

OTA is therefore compatible and prepared. Publishing requires Owner approval of CATALOG-RELEASE-APPROVAL.json. An online installed app checks/downloads at launch; with zero launch wait, applying the downloaded update may require closing and reopening the app again. This does not reinstall or silently replace the APK binary. Other installed APKs must share the same project/channel/runtime to receive it; no claim is made about uninspected variants.

## Release and rollback

The approval JSON binds exact Web/Android artifact manifests, source hashes, site, channel/runtime and rollback IDs. Proposed sequence: recheck hashes/baselines; Netlify draft; hosted Desktop/Mobile synthetic non-writing checks; Web publication; exact prebuilt Android OTA; verify delivery/navigation on the Owner-controlled device. No automated real Generate Code/import or financial write is authorized.

If a critical regression occurs, restore Netlify6ad49c64c2acd6e0352f242f and/or republish Android group9ae993b5-1566-41ea-821c-3cc94dce0151 to production using the recorded command. Existing devices must download/apply that rollback update as well. No database restoration is involved.

Patched hosted/physical Android acceptance is NOT TESTED because publication/install remains unapproved. This is an execution gate after approval, not a physical PASS manufactured from build results.

## Separate Global Currency decision

DEPENDENCY-DECISION-PACKAGE.json contains one consolidated decision request with four specific contracts: treasury source-account settlement binding; immutable original refund/tax allocations and reversal; procurement receipt/payment/funding/custody attestation; and complete cashier movement/collection/refund-to-shift binding. No general treasury contract was invented. Funding Control remains advances-only. Existing local source, tests, reader/PDF implementation and1904–1909 drafts remain preserved and inactive. Genuine financial platform acceptance and exact Production authorization are required after those authority gaps close. No historical audits/tests were repeated for this package.
