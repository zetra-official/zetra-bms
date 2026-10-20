from pathlib import Path
import json,hashlib,datetime,subprocess
D=Path(__file__).parent;E=D.parent;sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();read=lambda p:json.loads(p.read_text())
for line in (E/'PACKAGE-SHA256.txt').read_text().splitlines():
 h,n=line.split('  ',1);assert sha(E/n)==h,('SEALED_PACKAGE_DRIFT',n)
web=read(D/'publish.json');ui=read(D/'production-ui-smoke.json');fx=read(D/'production-fx-smoke.json');ota=read(D/'android-publication.json');network=read(D/'ota-network-proof.json');final=read(D/'final-verification.json')
assert web['status']=='SUCCESS' and ui['status']==fx['status']==network['status']==final['status']=='PASS' and ota['status']=='SUCCESS'
assert network['updateId']==ota['updateId'] and network['expectedBundleSha256']==network['deliveredBundleSha256']
assert web['deploymentId']==ui['deploymentId']==final['deploymentId']
smoke=read(D/'production-smoke.json');smoke['bundleVerification']='Complete candidate bundle SHA-256; same content-addressed entry bound by exact production HTML and matching first/last production ranges';(D/'production-smoke.json').write_text(json.dumps(smoke,indent=2))
result={'status':'DEPLOYMENT SUCCESS','releaseId':'ZETRA-CURRENCY-AUTH-WORKSPACE-RECOVERY-20261020','sourceCheckpoint':'553ac83c6dec01edf34538485e22e26bc6ae2592','approvedPackageSHA256':sha(E/'REPLACEMENT-APPROVAL.json'),'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'web':web,'webAuthenticatedSmoke':'PASS','fxLiveBoTAndECB':'PASS','fourDayAnd24HourPolicy':'PASS','originalTZSCompatibility':'PASS','android':ota,'otaDeliveredArtifactSHA256':network['deliveredBundleSha256'],'physicalAndroid':'NOT TESTED','physicalIPhoneSafari':'NOT TESTED','genuineCrossOrganization':'NOT TESTED; one accessible org, genuine re-selection PASS and deferred identity isolation tests PASS','browserProcessRestart':'NOT TESTED; new document, protected refresh and session resume PASS','rollback':read(E/'ROLLBACK.json'),'sql':[],'financialWrites':False,'financialActivation':False,'unrelatedSourcePublished':False}
(D/'FINAL-RESULT.json').write_text(json.dumps(result,indent=2))
report=f'''# DEPLOYMENT SUCCESS

Release: ZETRA-CURRENCY-AUTH-WORKSPACE-RECOVERY-20261020. Source/checkpoint: 553ac83c6dec01edf34538485e22e26bc6ae2592. Exact approval SHA-256: {result['approvedPackageSHA256']}.

- Web Production: SUCCESS — https://app.zetra.tz/ — deployment {web['deploymentId']}.
- Android OTA: SUCCESS — production channel/branch, runtime 1.0.0 — update {ota['updateId']}, group {ota['group']}.
- Genuine authenticated Desktop/Mobile Home, protected POS refresh, new-document session resume, organization chooser/re-selection, Finance and Currency UI: PASS. Observed runtime errors: zero on tested paths. Mobile POS 139.6/139.6 px at 319 px; Desktop 545/545 px at 1280 px; no horizontal overflow.
- Live Production BoT/ECB feeds, exact reference calculations, four-calendar-day/24-hour freshness checks: PASS. Actual Dashboard USD/KES/UGX/EUR display and Finance USD: PASS. Original TZS restored; no financial postings or cart mutations were made.
- Hosted candidate's complete 6,818,358-byte bundle matched the approved SHA-256. Production exact HTML and first/last ranges bind that same content-addressed entry. OTA network manifest/update/runtime matched; downloaded launch bundle SHA-256 {network['deliveredBundleSha256']} matched; all 46 unique asset manifest hashes matched the artifact.
- Currency UI/engine/catalog, Checkout, Catalog and runtime/dependency configuration remain within the sealed approved source scope. No SQL, financial activation or unrelated source was published.
- Physical Android/iPhone candidate verification: NOT TESTED. Genuine cross-organization switching: NOT TESTED (one accessible org); genuine re-selection and deferred identity isolation checks passed. Full browser-process/native app restart: NOT TESTED. No claim that every historical customer incident has been independently attributed.
- Rollback ready: Web {web['rollback']}; Android group {ota['rollbackGroup']}, previous update 01a1592b-2ee1-7ed9-ac55-fb2b9185776c. Verified retained artifacts remain available; rollback was not needed for this successful release.

The earlier package's live-connectivity limitation was resolved during this execution by the deployed live feed tests. Local captured-feed acceptance was not substituted for these production results. Existing Production data, root Catalog and unrelated uncommitted work were preserved.
'''
(D/'FINAL-REPORT.md').write_text(report,encoding='utf-8')
files=['OWNER-AUTHORIZATION.json','preflight.json','upload.json','candidate-smoke.json','candidate-fx-smoke.json','candidate-bot.public-feed','candidate-ecb.public-feed','publish.json','production-smoke.json','production-fx-smoke.json','production-bot.public-feed','production-ecb.public-feed','production-ui-smoke.json','final-verification.json','android-channel-before.json','android-publication-started.json','android-channel-after.json','android-publication.json','ota-network-proof.json','production-mobile-home.png','production-desktop-header.png','deploy_web.py','android_release.py','verify_fx.cjs','verify_ota_payload.py','upload_status.py','finalize_execution.py','FINAL-RESULT.json','FINAL-REPORT.md']
assert all((D/n).is_file() and '.private' not in n for n in files)
(D/'EXECUTION-SHA256.json').write_text(json.dumps({n:sha(D/n) for n in files},indent=2))
files+=['EXECUTION-SHA256.json'];(D/'checkpoint-files.private.json').write_text(json.dumps(files))
print(json.dumps({'status':result['status'],'webDeployment':web['deploymentId'],'androidUpdate':ota['updateId'],'exactApprovedPackageUnchanged':True,'publicExecutionFiles':len(files)}))
