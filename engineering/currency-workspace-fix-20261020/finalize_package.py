from pathlib import Path
import json,hashlib,datetime
D=Path(__file__).parent;sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(D/'release-delivery-evidence.json').write_bytes((D/'asset-delivery-requests.json').read_bytes())
sealed=json.loads((D/'SEALED-ARTIFACTS.json').read_text());sources=json.loads((D/'SOURCE-PACKAGE.json').read_text());targets=json.loads((D/'CURRENT-TARGETS.json').read_text())
units={n:json.loads((D/n).read_text()) for n in ['auth-recovery-unit-results.json','tabs-recovery-unit-results.json','org-generation-results.json','delivery-unit-results.json','render-recovery-results.json']}
assert all(v['status']=='PASS' for v in units.values())
acceptance={
 'status':'PASS_WITH_EXPLICIT_LIMITS','sealedArtifacts':{p:v['sha256'] for p,v in sealed.items()},
 'unitBehaviorChecks':40,'additionalStaticAuthGuards':4,'unitReports':list(units),
 'genuineOwnerAuth':True,'freshPrivateLogin':'PASS: localhost visible Owner Home, credentials entered by Owner only',
 'exactFinalArtifactFreshSessionRefresh':'PASS','newDocumentSessionResume':'PASS','protectedPOSRefresh':'PASS',
 'mobileWeb':{'engine':'Chromium viewport, not physical Safari/Android','width':390,'documentWidth':390,'homeCurrency':'PASS','posColumns':[175.1999969482422,175.1999969482422]},
 'desktopWeb':{'width':1280,'documentWidth':1280,'homeAndFinance':'PASS','runtimeErrorsObserved':0,'pos50_50':'PASS retained genuine pre-generation-guard evidence; POS source unchanged'},
 'organizationSelection':'PASS genuine chooser and re-selection; one accessible organization',
 'identityChangeIsolation':'PASS deterministic actual-loader deferred SDK/RPC tests on both platform sources; not genuine cross-tenant acceptance',
 'deliveryFaults':'PASS final sealed artifact: truncated full + corrupted range blocked; explicit retry with transient range failure recovered protected POS and preference',
 'fx':'PASS official cached-reference calculation/UI evidence USD/KES/UGX/EUR; final sealed Dashboard and Finance USD also passed; no invented rates',
 'fxLiveConnectivity':'NOT PASS: current live requests unavailable; fail-closed original display verified; captured feeds are not live connectivity acceptance',
 'policy':'Unchanged verified engine: 4 calendar days reference date, 24 hours retrieval; current-rate reference valuation, not bank buy/sell',
 'originalTZS':'PASS original amounts displayed alongside conversion, Original restores TZS; no financial postings performed',
 'physicalAndroid':'NOT TESTED','physicalIPhoneSafari':'NOT TESTED','browserProcessRestart':'NOT TESTED; fresh document and protected reload tested','nativeAppRestart':'NOT TESTED','genuineCrossOrganizationSwitch':'NOT TESTED; one accessible organization',
 'productionReadOnly':'Owner Desktop/Mobile refresh observed PASS; cannot attribute all reported customer incidents',
 'currencyCheckoutCatalogPreservation':'PASS strict source/ZIP byte comparison','productionSql':[],'financialWrites':False,'publication':False}
(D/'ACCEPTANCE.json').write_text(json.dumps(acceptance,indent=2))
release='ZETRA-CURRENCY-AUTH-WORKSPACE-RECOVERY-20261020'
md=f'''# {release}

Replacement ready for Owner review. No publication, SQL or financial activation has occurred. This package combines the preserved Currency UI Refinement with the minimum Auth/workspace reliability patch. The earlier c2c390dc approval does not authorize this replacement.

## Verified behavior

Genuine Owner login and authenticated Home, protected refresh, new-document session resume, Mobile/Desktop Dashboard, Finance and organization re-selection passed. Final Mobile POS columns measured 175.2/175.2 px with no horizontal overflow at 390 px. Forty unit behavior checks plus four static auth guards passed. Production-configured Web/Android TypeScript, release guard and Expo exports passed. Full source review patches and exact artifact/file manifests are included.

Confirmed fixes: incomplete bundle download now has verified retry/fallback; session transport failure no longer means logout; late bootstrap/identity responses cannot overwrite a newer session; the Tabs remote identity wait no longer renders an empty view; canonical workspace errors receive retry instead of onboarding; render failures have a generic recovery boundary. See ROOT-CAUSE.md for evidence and attribution limits.

Currency UI, FX engine/catalog/policy, Checkout and Catalog sources remain byte-identical to their approved platform baselines. Original TZS display is preserved. No new financial functionality, dependency, runtime, SQL or backend schema is included.

## Exact artifacts

| Platform | ZIP | SHA-256 |
|---|---|---|
| Web | {sealed['web']['archive']} | `{sealed['web']['sha256']}` |
| Android | {sealed['android']['archive']} | `{sealed['android']['sha256']}` |

Web source ZIP SHA-256: `{sources['web']['sha256']}`.

Android source ZIP SHA-256: `{sources['android']['sha256']}`.

All 272 Web files and 48 Android files match the sealed manifests and ZIP contents. Only seven Web and six Android source paths differ from the approved Currency UI source ZIPs. PACKAGE-SHA256.txt binds the approval documents and public evidence. Never build or deploy the mixed root checkout.

## Explicit acceptance limits

Physical Android/iPhone candidate verification, native app restart and full browser-process restart: **NOT TESTED**. Owner has one accessible organization: genuine organization re-selection passed, genuine switching between two organizations is **NOT TESTED**; deferred identity isolation tests and prior synthetic isolation evidence are retained.

USD/KES/UGX/EUR genuine UI calculation acceptance used hash-verified official BoT captured feeds (20 October); final Dashboard/Finance USD also passed. Current live provider requests were unavailable; fail-closed behavior passed. **Live FX availability is not claimed PASS.** The test-only feed cache/harness is excluded from release artifacts. Existing FX code and 4-day/24-hour policy are unchanged. Recheck live BoT/ECB retrieval at publication and do not claim conversion when unavailable.

No customer incident logs were collected, and not every historic customer complaint is attributed to these paths. No guarantee of future network availability is implied.

## Existing production and rollback

Web: https://app.zetra.tz · Netlify site `{targets['site']}`. Restored active deployment/verified rollback: `{targets['webActiveAndRollback']}`.

Android: existing production channel/branch, runtime `1.0.0`, project `a8536709-2bea-40f4-8dd7-01563bd08c70`, package `com.anonymous.zetrabmsclean`. Unchanged update `{targets['androidUpdate']}`; rollback group `{targets['androidRollbackGroup']}`. Runtime/dependency configuration is byte-identical; no APK/native upgrade is requested.

ROLLBACK.json verifies the retained Web and Android rollback files. Channel targets were checked read-only at {targets['checkedAt']}.

## One requested approval

Approve this exact replacement package and its disclosed limits for publication through the existing channels: verify checksums/channel drift, publish Web, run genuine authenticated Desktop/Mobile Home/POS/Finance refresh and live FX smoke without financial postings, then publish compatible Android OTA only after Web PASS. Stop and restore the verified rollback on critical Auth/workspace/financial-integrity failure. Physical-device acceptance remains explicitly pending Owner verification. No SQL, financial activation or unrelated source changes are authorized by this request.
'''
(D/'REPLACEMENT-APPROVAL.md').write_text(md,encoding='utf-8')
files=['.gitattributes','.gitignore','ROOT-CAUSE.md','HANDOVER.md','ACCEPTANCE.json','REPLACEMENT-APPROVAL.md','SOURCE-PACKAGE.json','SEALED-ARTIFACTS.json','BUILD-web.json','BUILD-android.json','ARTIFACT-web-SHA256.json','ARTIFACT-android-SHA256.json','PRESERVATION.json','ROLLBACK.json','CURRENT-TARGETS.json','PRODUCTION-RANGE-COMPATIBILITY.json','PRODUCTION-WEB-POLICY.json','DELIVERY-PACKAGING.json','FX-ACCEPTANCE-CACHE.json','FX-EXACT-UI-RESULTS.json','baseline-comparison.json','bootstrap-source-comparison.json','bundle-full-get.json','failed-delivery-progress.json','working-delivery-progress.json','IDENTITY-EXPERIMENT-NOT-RELEASED.json','auth-recovery.test.cjs','tabs-recovery.test.cjs','org-generation.test.cjs','delivery.test.cjs','render-recovery.test.cjs','review_source.py','build_release.cjs','finalize_package.py','checkpoint_package.py','source-web.patch','source-android.patch','old-interrupted-loading.png','old-interrupted-loading.txt','release-mobile-home.png','release-desktop-settled-header.png','release-desktop-tzs-header.png','release-corruption-rejected.png','fresh-login-home.png','release-fresh-login-refresh-home.png','release-delivery-evidence.json']+list(units)
for p in sealed:files.extend([sealed[p]['archive'],sources[p]['archive']])
assert len(files)==len(set(files))
assert all('.private' not in n and (D/n).is_file() for n in files)
approval={'releaseId':release,'status':'READY_FOR_OWNER_REVIEW_WITH_DISCLOSED_LIMITS','baseCheckpoint':'28fae9655f9613daf0d073d0267711549d224a91','approvedCurrencyUIBase':'c2c390dc88c2604f68b5fb951cc80320e4f09213','web':sealed['web'],'android':sealed['android'],'source':sources,'acceptance':'ACCEPTANCE.json','rootCause':'ROOT-CAUSE.md','rollback':'ROLLBACK.json','targets':targets,'productionPublication':False,'requiresNewOwnerApproval':True,'sql':[],'financialActivation':False,'protectedSourcePreservation':True,'publicFiles':{n:sha(D/n) for n in sorted(files)},'checkpointFiles':sorted(files+['asset-delivery-requests.json','REPLACEMENT-APPROVAL.json','PACKAGE-SHA256.txt'])}
(D/'REPLACEMENT-APPROVAL.json').write_text(json.dumps(approval,indent=2))
(D/'PACKAGE-SHA256.txt').write_text(''.join(sha(D/n)+'  '+n+'\n' for n in sorted(files+['REPLACEMENT-APPROVAL.json'])))
print(json.dumps({'release':release,'status':approval['status'],'checkpointFiles':len(approval['checkpointFiles']),'approvalSHA256':sha(D/'REPLACEMENT-APPROVAL.json'),'productionPublication':False}))
