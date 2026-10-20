from pathlib import Path
import json,hashlib,subprocess
E=Path(__file__).resolve().parent;R=E.parent.parent
read=lambda p:json.loads(p.read_text(encoding='utf-8'));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert read(E/'ISOLATION-PROOF.json')['status']=='PASS'
web=read(E/'WEB-DASHBOARD-ACCEPTANCE.json');assert web['status']=='PASS'
native=read(E/'ANDROID-DASHBOARD-ACCEPTANCE.json') if (E/'ANDROID-DASHBOARD-ACCEPTANCE.json').exists() else {'status':'PENDING_PRIVATE_ANDROID_SESSION','reason':'Actual complete local Dashboard must be authenticated and observed; no physical-device PASS inferred from builds'}
files=['REPLACEMENT-APPROVAL.md','SEALED-ARTIFACTS.json','ISOLATION-PROOF.json','isolated-web-source-manifest.json','isolated-android-source-manifest.json','dashboard-fix-web-source.zip','dashboard-fix-android-source.zip','dashboard-tests.log','dashboard.test.cjs','isolated-web-build.log','isolated-android-build.log','WEB-DASHBOARD-ACCEPTANCE.json','mobile-dashboard-entry.png','mobile-dashboard-320.png','prepare_dashboard_fix.py','build_isolated.cjs','seal_dashboard_fix.py','create_replacement_package.py']
if (E/'ANDROID-DASHBOARD-ACCEPTANCE.json').exists():files.append('ANDROID-DASHBOARD-ACCEPTANCE.json')
for optional in ['CURRENT-TARGETS-READONLY.json','verify_existing_targets_readonly.py','RESUME.md']:
 if (E/optional).exists():files.append(optional)
artifacts=read(E/'SEALED-ARTIFACTS.json')
for platform,m in artifacts.items():
 root=E/('release-artifact-'+platform)
 assert set(m['files'])=={p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file()}
 for rel,h in m['files'].items():assert sha(root/rel)==h
result={'id':'ZETRA-CURRENCY-DISPLAY-DASHBOARD-FIX-20261020','status':'READY_FOR_OWNER_REPLACEMENT_APPROVAL' if native['status']=='PASS' else 'EXACT_BLOCKER_ANDROID_PRIVATE_RUNTIME_ACCEPTANCE','replaces':'ZETRA-CURRENCY-DISPLAY-20261020','recoveryCheckpoint':'748c686a','scopeDelta':['app/(tabs)/index.tsx','src/currency/DashboardCurrency.tsx','src/currency/dashboardValuation.ts'],'productionSql':[],'financialActivation':False,'financialWrites':False,'productionPublicationExecuted':False,'webAcceptance':web['status'],'androidAcceptance':native,'rollback':{'webDeployment':'6ad49c64c2acd6e0352f242f','androidGroup':'9ae993b5-1566-41ea-821c-3cc94dce0151','androidUpdate':'01a14bd2-bbe2-7d84-b0cd-154911b0a21e','runtime':'1.0.0'},'sha256':{f:sha(E/f) for f in files}}
(E/'REPLACEMENT-APPROVAL.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps({'id':result['id'],'status':result['status'],'boundFiles':len(files)}))
