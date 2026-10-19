from pathlib import Path
import json,hashlib,difflib,subprocess
R=Path.cwd();E=R/'engineering/currency-financial-integration-20261019'
pre=json.loads((E/'PREIMAGES.json').read_text());patch=[];changed=[]
for row in pre:
 name=row['file'];before=E/'before'/name;after=R/name
 assert hashlib.sha256(before.read_bytes()).hexdigest()==row['beforeSha256']
 if before.read_bytes()!=after.read_bytes():
  changed.append({'file':name,'beforeSha256':row['beforeSha256'],'afterSha256':hashlib.sha256(after.read_bytes()).hexdigest(),'existedInStartingWorkingTree':True})
  patch.extend(difflib.unified_diff(before.read_text(encoding='utf-8').splitlines(True),after.read_text(encoding='utf-8').splitlines(True),fromfile='a/'+name,tofile='b/'+name))
(E/'SCOPE-DELTA.patch').write_text(''.join(patch),encoding='utf-8')
new=['src/currency/accounting.ts','src/currency/useAccountingAuthority.ts','src/currency/financialMessages.ts','src/offline/receiptTotals.ts']
for name in new:changed.append({'file':name,'afterSha256':hashlib.sha256((R/name).read_bytes()).hexdigest(),'newFile':True})
(E/'SOURCE-MANIFEST.json').write_text(json.dumps(changed,indent=2));print(json.dumps({'modifiedFiles':len(changed),'sourceWorkingTreePreserved':True}))
