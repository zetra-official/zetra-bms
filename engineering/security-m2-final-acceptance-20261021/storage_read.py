from pathlib import Path
import sys,json
B=Path('engineering/security-owner-privacy-m2-20261021');E=Path('engineering/security-m2-final-acceptance-20261021');sys.path.insert(0,str(B.resolve()))
from capture_catalog import query
q="BEGIN READ ONLY;SET LOCAL statement_timeout='15s';SELECT bucket_id,coalesce(metadata->>'mimetype','unknown') mime,count(*) objects FROM storage.objects GROUP BY 1,2 ORDER BY 1,2;ROLLBACK;"
r=query(q);(E/'STORAGE-AGGREGATES.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
q="BEGIN READ ONLY;SET LOCAL statement_timeout='15s';SELECT table_schema,table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND column_name ~* '(url|attachment|file_path|document_path|receipt_path)' ORDER BY 1,2,3;ROLLBACK;"
r=query(q);(E/'STORAGE-REFERENCE-COLUMNS.json').write_text(json.dumps(r,indent=2));print('Reference columns:',len(r))
