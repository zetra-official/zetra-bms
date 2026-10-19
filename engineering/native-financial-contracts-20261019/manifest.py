from pathlib import Path
import hashlib,json,datetime
R=Path.cwd();E=Path(__file__).resolve().parent
sources=['src/currency/settlement.ts','src/offline/nativeSaleTransport.ts','src/offline/salesQueue.ts','src/offline/salesSync.ts','src/offline/receiptTotals.ts','app/(tabs)/sales/offline-receipt.tsx']
paths=[R/p for p in sources]
paths += [p for p in E.rglob('*') if p.is_file() and not any(part.startswith('disposable') or part=='__pycache__' for part in p.relative_to(E).parts) and '.private.' not in p.name and p.name not in ['postgres.log','SHA256-MANIFEST.json','CHECKPOINT.json']]
rows=[{'path':p.relative_to(R).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size} for p in sorted(paths)]
(E/'SHA256-MANIFEST.json').write_text(json.dumps({'status':'LOCAL_ONLY_PARTIAL','baseCheckpoint':'5b1c604','sourceFiles':sources,'files':rows,'productionWrites':0,'deployment':False,'nativeClientActive':False},indent=2))
print('Manifest: '+str(len(rows))+' preserved source/evidence files')
