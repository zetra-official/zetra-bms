from pathlib import Path
import sys,json,urllib.request,urllib.parse,hashlib
B=Path('engineering/security-owner-privacy-m2-20261021');E=Path('engineering/security-m2-final-acceptance-20261021');sys.path.insert(0,str(B.resolve()));from capture_catalog import query
rows=query("BEGIN READ ONLY;SET LOCAL statement_timeout='15s';SELECT bucket_id,name,metadata->>'mimetype' mime FROM storage.objects WHERE metadata->>'mimetype' IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document');ROLLBACK;")
(E/'storage-documents.private.json').write_text(json.dumps(rows))
results=[]
for r in rows:
 url='https://dcmhqdckzhbuakvcyjit.supabase.co/storage/v1/object/public/'+r['bucket_id']+'/'+urllib.parse.quote(r['name'],safe='/')
 try:
  with urllib.request.urlopen(urllib.request.Request(url,method='HEAD'),timeout=20) as resp: status=resp.status;mime=resp.headers.get('content-type')
 except urllib.error.HTTPError as ex:status=ex.code;mime=ex.headers.get('content-type')
 results.append({'objectSha256':hashlib.sha256(r['name'].encode()).hexdigest(),'bucket':r['bucket_id'],'metadataMime':r['mime'],'unauthenticatedHead':status,'responseMime':mime,'bodyDownloaded':False})
(E/'PUBLIC-DOCUMENT-HEAD.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
r=query("BEGIN READ ONLY;SET LOCAL statement_timeout='15s';SELECT coalesce(attachment_type,'unknown') attachment_type,count(*) total,count(*) FILTER (WHERE attachment_url LIKE '%/storage/v1/object/public/%') public_storage_urls FROM public.meeting_room_messages GROUP BY 1;ROLLBACK;")
(E/'ATTACHMENT-AGGREGATES.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
