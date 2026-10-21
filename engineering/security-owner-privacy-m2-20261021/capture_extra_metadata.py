from pathlib import Path
import json
from capture_catalog import query,E
sql="""BEGIN READ ONLY;SET LOCAL statement_timeout='15s';
SELECT n.nspname schema,c.relname table_name,a.attname column_name,a.attacl::text acl
FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('products','sale_items') AND a.attnum>0 AND NOT a.attisdropped;
ROLLBACK;"""
(E/'column-acls.private.json').write_text(json.dumps(query(sql),indent=2),encoding='utf-8')
# Bucket configuration only. Never lists objects, customer documents, paths or signed URLs.
sql="""BEGIN READ ONLY;SET LOCAL statement_timeout='15s';
SELECT id,name,public,file_size_limit,allowed_mime_types FROM storage.buckets;
ROLLBACK;"""
rows=query(sql);(E/'bucket-config.private.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
print(json.dumps({'columnAclMetadata':True,'bucketConfigCount':len(rows),'customerDocumentsRead':False,'hostedWrites':False}))
