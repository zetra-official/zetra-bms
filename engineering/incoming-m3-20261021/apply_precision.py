from pathlib import Path
import sys,json
E=Path(__file__).resolve().parent;sys.path.insert(0,str(E.parent/'security-owner-privacy-m2-20261021'));import local_runtime as l
l.db.E=E;l.db.CLUSTER=E/'disposable';l.db.PORT=json.loads((E/'db.private.json').read_text())['port']
assert Path(l.db.sql("SELECT current_setting('data_directory')")[1].strip()).resolve()==(E/'disposable').resolve()
r=l.db.sql((E/'2026102104-precision-price.DRAFT.sql').read_text(encoding='utf-8'),False)
(E/'precision-apply.log').write_text(json.dumps({'localOnly':True,'exitCode':r[0],'diagnostic':r[2]},indent=2),encoding='utf-8');print('Precision extension disposable apply:',r[0]);print(r[2][-1500:]);raise SystemExit(r[0])
