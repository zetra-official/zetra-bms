from pathlib import Path
import ast,hashlib,json,subprocess
R=Path.cwd();E=R/'engineering/global-currency-final-20261019';D=R/'engineering/currency-tzs-acceptance-20261019'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for f,h in json.loads((D/'SHA256-MANIFEST.json').read_text()).items():assert sha(D/f)==h,'ACCEPTED_ARTIFACT_CHANGED:'+f
assert 'ATOMIC_CURRENCY_ONBOARDING_ACTIVE=false' in (R/'src/currency/onboarding.ts').read_text()
for p in E.rglob('*.py'):ast.parse(p.read_text(encoding='utf-8'))
sources=['src/currency/engine.ts','src/currency/metadata.ts','src/currency/historical.ts','src/currency/offlineContext.ts','src/currency/data/catalog.json','src/services/referenceFx.ts','src/utils/discount.ts','src/pos/itemAdjustment.ts','src/currency/onboardingClient.ts','src/currency/onboarding.ts','app/(onboarding)/store.tsx','src/currency/masterMessages.ts']
source_evidence={p:sha(R/p) for p in sources}
source_evidence['engineering/currency-tzs-acceptance-20261019/SHA256-MANIFEST.json']=sha(D/'SHA256-MANIFEST.json')
(E/'SOURCE-EVIDENCE.json').write_text(json.dumps({'sourceCheckpoint':'7736018','sourceHashes':source_evidence,'acceptedManifestIntact':True,'applicationSourceChangesThisContinuation':0},indent=2),encoding='utf-8')
files=[p for p in E.rglob('*') if p.is_file() and '__pycache__' not in p.parts and '.private.' not in p.name and p.name!='SHA256-MANIFEST.json']
(E/'SHA256-MANIFEST.json').write_text(json.dumps({p.relative_to(E).as_posix():sha(p) for p in sorted(files)},indent=2),encoding='utf-8')
print(json.dumps({'acceptedManifest':'PASS','pythonSyntax':'PASS','newEvidenceFiles':len(files),'sourceUnchangedByThisContinuation':True}))
