from pathlib import Path
import hashlib,json
R=Path.cwd();E=R/'engineering/currency-financial-integration-20261019'
files=['src/currency/engine.ts','src/pos/itemAdjustment.ts','src/offline/salesQueue.ts','src/offline/salesSync.ts','app/(tabs)/sales/checkout.tsx','app/(tabs)/sales/index.tsx','app/(tabs)/sales/offline-receipt.tsx']
rows=[]
for name in files:
 p=R/name;dest=E/'before'/name;dest.parent.mkdir(parents=True,exist_ok=True);assert not dest.exists();dest.write_bytes(p.read_bytes());rows.append({'file':name,'beforeSha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(E/'PREIMAGES.json').write_text(json.dumps(rows,indent=2))
