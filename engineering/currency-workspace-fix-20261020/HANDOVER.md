# Resume this exact replacement

Release: ZETRA-CURRENCY-AUTH-WORKSPACE-RECOVERY-20261020.

Use REPLACEMENT-APPROVAL.md/json and PACKAGE-SHA256.txt. The release artifact ZIPs and source ZIPs are sealed; never rebuild or publish the mixed root checkout. Exact final sources are inside workspace-recovery-web-source.zip and workspace-recovery-android-source.zip. Source directories are working copies; the archives/manifests are authoritative.

Production is unchanged: Web 6ad76cf47622bc0a29e1244f, Android update 01a1592b-2ee1-7ed9-ac55-fb2b9185776c, production/runtime 1.0.0. Existing verified rollback files remain in the checkout-safari and currency-dashboard packages. No publication is authorized for this replacement yet.

Next action: obtain one Owner approval for the exact replacement, including the explicit acceptance limits. At execution recheck package hashes and channel drift, publish Web through the existing Netlify site, perform genuine authenticated Desktop/Mobile Home/POS/Finance refresh and FX smoke, then publish the compatible Android artifact to the existing production channel only after Web passes. Stop/restore the verified rollback for a critical failure. No SQL or financial postings.

Local acceptance server: serve_delivery.py, 127.0.0.1:55660 (localhost alias). It serves sealed artifacts and supports controlled asset faults. verifiedFxCache=true serves hash-checked official captured reference feeds for calculation acceptance only; this harness is excluded from the release. It never proxies financial POSTs. Do not infer live provider connectivity from cached acceptance. Private screenshots/text/build logs remain ignored on disk and must not be published or staged.

Preserve all unrelated root changes, Catalog and earlier exports. Prior diagnostics and before-generation artifacts are preserved but excluded. Physical Android/iPhone, genuine cross-organization switching (Owner has one org), browser-process restart and native app restart are NOT TESTED for this candidate. New-document session resume, genuine fresh Owner login, protected refresh and actual organization re-selection were tested. Do not repeat the completed checks unless source changes or release execution requires it.
