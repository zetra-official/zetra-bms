from pathlib import Path
import subprocess
E=Path(__file__).resolve().parent;R=E.parent.parent
names=['execute_sql.py','deploy_web.py','android_release.py','verify_ota_payload.py','smoke_anonymous.cjs','finalize_deployment.py','checkpoint_deployment.py']
names+=['production-20261021/'+n for n in ['WEB-UPLOAD.json','WEB-CANDIDATE.json','SQL-EXECUTION.json','SQL-VERIFIED.json','WEB-PUBLISH.json','WEB-PRODUCTION.json','WEB-FINAL-VERIFICATION.json','PRODUCTION-UI.json','PRODUCTION-ANON-SMOKE.json','ANDROID-BEFORE.json','ANDROID-AFTER.json','ANDROID-PUBLICATION.json','OTA-NETWORK-PROOF.json','FINAL-DEPLOYMENT.json','FINAL-DEPLOYMENT.md']]
assert not subprocess.check_output(['git','diff','--cached','--name-only'],cwd=R,text=True).strip()
assert all((E/n).is_file() and '.private.' not in n for n in names)
subprocess.run(['git','add','-f','--',*[str((E/n).relative_to(R)) for n in names]],cwd=R,check=True)
subprocess.run(['git','commit','-m','Record verified Combined M3 Production Web and Android OTA publication'],cwd=R,check=True)
print(subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip())
