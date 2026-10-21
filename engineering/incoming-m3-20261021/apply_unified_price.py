from pathlib import Path
import sys,json,re
E=Path(__file__).resolve().parent
sys.path.insert(0,str(E.parent/'security-owner-privacy-m2-20261021'))
import local_runtime as l
l.db.E=E;l.db.CLUSTER=E/'disposable';l.db.PORT=json.loads((E/'db.private.json').read_text())['port']
assert Path(l.db.sql("SELECT current_setting('data_directory')")[1].strip()).resolve()==(E/'disposable').resolve()
draft=(E/'2026102105-unified-price.DRAFT.sql').read_text(encoding='utf-8')
if l.db.sql("SELECT to_regclass('incoming_m3.saved_receives') IS NOT NULL")[1].strip()=='t':
 functions=[m.group(0).replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1) for m in re.finditer(r'CREATE (?:OR REPLACE )?FUNCTION .*?\sAS\s+(\$[A-Za-z_]*\$).*?\1;',draft,re.S)]
 assert len(functions)==5,len(functions)
 privileges=re.findall(r'(?:REVOKE ALL ON |GRANT EXECUTE ON ).*?;',draft,re.S)
 draft='BEGIN;\n'+'\n'.join(functions+privileges)+"\nDROP FUNCTION IF EXISTS incoming_m3.receive_saved_canonical(uuid,jsonb,uuid);\nNOTIFY pgrst,'reload schema';COMMIT;"
r=l.db.sql(draft,False)
(E/'unified-price-apply.log').write_text(json.dumps({'localOnly':True,'exitCode':r[0],'diagnostic':r[2]},indent=2))
print(r[0],r[2][-1500:]);raise SystemExit(r[0])

