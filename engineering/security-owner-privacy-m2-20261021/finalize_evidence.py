from pathlib import Path
import subprocess,json,hashlib,os
E=Path(__file__).resolve().parent;R=E.parent.parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
p=subprocess.run(['node','--test',str(E/'compatibility.test.cjs')],cwd=R,capture_output=True,text=True,encoding='utf-8')
(E/'COMPATIBILITY-TAP.log').write_text(p.stdout+p.stderr,encoding='utf-8');assert p.returncode==0
assert '# pass 24' in p.stdout and '# fail 0' in p.stdout
(E/'COMPATIBILITY-RESULTS.json').write_text(json.dumps({'status':'PASS','checks':24,'tapSHA256':sha(E/'COMPATIBILITY-TAP.log'),'scope':'Node currency/localization and source contracts; not physical UI/PDF runtime','sourceArchives':{x:sha(E/f'M2-{x}-source.zip') for x in ['web','android']}},indent=2))
assert not (E/'disposable/postmaster.pid').exists(),'M2_DATABASE_NOT_STOPPED'
subprocess.run(['python',str(E/'seal_local.py')],cwd=R,check=True)
names=['REPORT.md','M2-MANIFEST.json','PRESERVATION.json','BASELINE.json','FUNCTION-CHANGE-MANIFEST.json','CLIENT-QUARANTINE.json','SECURITY-TEST-RESULTS.json','INDIRECT-PATH-RESULTS.json','CONCURRENCY-RESULTS.json','ATOMICITY-RESULTS.json','EFFECTIVE-PRIVILEGES.json','COMPATIBILITY-RESULTS.json','COMPATIBILITY-TAP.log','BUILD-web.json','BUILD-android.json','SOURCE-web.patch','SOURCE-android.patch']
names+=sorted(p.name for p in E.glob('*.py'))+['compatibility.test.cjs','2026102101-owner-privacy.DRAFT.sql','security_helpers.DRAFT.sql','.gitignore','.gitattributes']
hashes={name:sha(E/name) for name in sorted(set(names))}
(E/'FILE-SHA256.json').write_text(json.dumps(hashes,indent=2))
(E/'checkpoint-files.private.json').write_text(json.dumps([str((E/name).relative_to(R)).replace('\\','/') for name in [*hashes,'FILE-SHA256.json']],indent=2))
print(json.dumps({'evidenceFiles':len(hashes),'sqlSHA256':sha(E/'2026102101-owner-privacy.DRAFT.sql'),'manifestSHA256':sha(E/'M2-MANIFEST.json'),'rootPreserved':True,'localDatabaseStopped':True,'status':'M2 PARTIAL'}))
