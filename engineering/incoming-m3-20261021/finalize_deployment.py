from pathlib import Path
import json,hashlib,subprocess,datetime
E=Path(__file__).resolve().parent;P=E/'production-20261021';R=E.parent.parent;read=lambda n:json.loads((P/n).read_text(encoding='utf-8'));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for n in ['SQL-VERIFIED.json','WEB-PRODUCTION.json','WEB-FINAL-VERIFICATION.json','PRODUCTION-UI.json','PRODUCTION-ANON-SMOKE.json','OTA-NETWORK-PROOF.json']:assert read(n)['status']=='PASS',n
assert read('WEB-PUBLISH.json')['status']=='SUCCESS' and read('ANDROID-PUBLICATION.json')['status']=='SUCCESS'
m=read('RELEASE-MANIFEST.json')
for platform in ['web','android']:
 b=read('BUILD-'+platform+'.json');source=E/('source-'+platform)
 assert sha(P/('BUILD-'+platform+'.json'))==m['platforms'][platform]['descriptorSHA256']
 assert all(sha(source/f)==h for f,h in b['sourceInputs'].items()),'Source drift'
 assert all(sha(Path(b['artifact'])/f)==h for f,h in b['files'].items()),'Artifact drift'
protected=json.loads((E.parent/'security-owner-privacy-m2-20261021/BASELINE.json').read_text())['protectedDirtyFiles'];assert all(sha(R/f)==h for f,h in protected.items())
out={'status':'DEPLOYMENT SUCCESS','release':m['release'],'sourceCommit':'d67c5659472974af02a682655ccc8cf46b4cb91d','verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'web':read('WEB-FINAL-VERIFICATION.json'),'android':read('ANDROID-PUBLICATION.json'),'otaPayload':read('OTA-NETWORK-PROOF.json'),'protectedRootFilesUnchanged':len(protected),'customerFinancialPostings':False,'sourceAndArtifactIntegrity':'PASS','physicalDeviceAcceptance':'NOT TESTED','productionStaffSession':'NOT TESTED; local genuine Staff acceptance and deployed narrow RPC definition/ACL verified','hashes':{platform:m['platforms'][platform]['archiveSHA256'] for platform in ['web','android']}}
(P/'FINAL-DEPLOYMENT.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
report=f"""# DEPLOYMENT SUCCESS — Combined M3

Release: {m['release']}. Application source commit: d67c5659.

- Web Production: **SUCCESS**, https://app.zetra.tz — deployment `6ad928b824a83b6bceb2f0fe`.
- Android OTA: **SUCCESS**, channel `production`, runtime `1.0.0`.
  Update `01a16066-5471-7f86-acbf-570665e39218`;
  group `60877bc5-2219-4da5-b573-c6be21b4cb00`.
- OTA delivery: actual endpoint bundle SHA-256 matches sealed artifact; all 46
  unique asset hashes match. This proves publication/delivery, not device execution.
- Incoming Stock: deployed bulk entry and existing orders UI PASS with genuine
  Owner authentication. Corrected cost/selling behavior, immediate receiving,
  saved partial/full, exact retries, stale edits and historical preservation:
  **42/42 local PostgreSQL PASS**, 5 model/source checks PASS, affected legacy 17 PASS.
  Actual local Unit & Pack UI: 2 boxes ×6 =12 units, cost600/selling1200,
  destination10→22, other store7 unchanged, one movement/audit/receipt.
- Precision Retail: existing calculator and product identity retained; canonical
  organization pricing verified with disposable Standard and Precision records.
- Staff Dashboard: deployed unchanged verified personal projection; local genuine
  Staff acceptance and deployed exact RPC body/ACL PASS. **A real Production Staff
  session was NOT TESTED.** Legacy ambiguous collection linkage remains unavailable,
  preserving the established fail-closed behavior.
- Production smoke: authenticated Dashboard after refresh, Incoming, POS product
  catalog/currency controls and Finance loaded. BoT USD display reference available
  (effective2026-10-22, retrieved2026-10-21T21:35:26.035Z); original TZS restored.
  Four new read RPCs rejected anonymous requests with42501.
- Database: atomic approved M3 DDL SUCCESS; 14 function definitions verified.
  Existing Products writer and legacy ACLs unchanged. Hosted default service_role
  grants on new public APIs were distinguished from customer/anonymous access.
  Full M2 hardening and blocked finance/funding adapters were not activated.
- No customer sale, payment or inventory receipt was posted during smoke. No
  historical data rewrite, unrelated source change, Staging deployment or GitHub push.
  All32 protected dirty root files retain their baseline hashes.

Physical Android/iPhone and native PDF Print/Share for this candidate are **NOT
TESTED**. Production receiving was intentionally not financially posted; executable
financial acceptance used disposable local fixtures. Seven-language/currency/PDF
evidence already accepted is preserved, not falsely relabeled as hosted/device tests.

## Hashes and rollback

Web archive SHA-256: `{out['hashes']['web']}`.

Android archive SHA-256: `{out['hashes']['android']}`.

SQL SHA-256: `{m['sql']['sql']['RELEASE.sql']}`.

Web rollback `6ad7c9964f937e8f233408c1` remains ready.
Android rollback group `a22b1c60-6970-4912-887c-72bf70849579` is retained.
`ROLLBACK.sql` restores captured canonical function preimages, removes the price
audit trigger and revokes new customer APIs while preserving private receipt/audit
evidence. No rollback reverses completed customer financial/inventory activity.
The release+rollback DDL and private permissions were rehearsed locally in a
rolled-back transaction. No critical remaining deployment defect was observed.
"""
(P/'FINAL-DEPLOYMENT.md').write_text(report,encoding='utf-8');print(json.dumps({'status':out['status'],'sourceCommit':out['sourceCommit'],'rootFilesPreserved':len(protected)}))
