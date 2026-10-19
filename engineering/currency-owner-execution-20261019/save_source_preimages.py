from pathlib import Path
import subprocess,hashlib,json
R=Path.cwd();E=Path(__file__).resolve().parent;rows=[]
prior=json.loads((R/'engineering/global-currency-final-20261019/SOURCE-EVIDENCE.json').read_text())['sourceHashes']
for f in ['src/currency/engine.ts','src/ui/money.ts']:
 raw=subprocess.check_output(['git','show','HEAD:'+f]);variants=[raw,raw.replace(b'\r\n',b'\n').replace(b'\n',b'\r\n')]
 original=next((v for v in variants if hashlib.sha256(v).hexdigest()==prior.get(f)),variants[-1]);p=E/'before'/f;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(original)
 rows.append({'file':f,'preimageSha256':hashlib.sha256(original).hexdigest(),'sourceSha256':hashlib.sha256((R/f).read_bytes()).hexdigest(),'preimageFrom':'HEAD before this continuation; source was clean before formatter correction','priorEvidenceMatch':None if f not in prior else hashlib.sha256(original).hexdigest()==prior[f]})
(E/'SOURCE-CHANGES.json').write_text(json.dumps(rows,indent=2));print(json.dumps({'saved':len(rows),'priorEngineHashMatched':rows[0]['priorEvidenceMatch']}))
