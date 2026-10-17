"""Test the exact owner-facing verification and revoke-only rollback on disposable local state."""
from pathlib import Path
import sys,socket,json
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path(__file__).parent));import test_local as t
base=t.BASE/'main-project-release/proforma-normal';cluster=max((p for p in base.glob('conversion-*') if p.is_dir() and not(p/'postmaster.pid').exists()),key=lambda p:p.stat().st_ctime)
with socket.socket() as s:s.bind(('127.0.0.1',0));t.PORT=s.getsockname()[1]
D=t.ROOT/'supabase/backend-review/20261017';E=t.ROOT/'engineering/release/proforma-conversion'
try:
 r=t.pg.tool('pg_ctl',['-D',str(cluster),'-l',str(cluster.with_suffix('.finalize.log')),'-o',f'-h 127.0.0.1 -p {t.PORT} -c archive_mode=off -c shared_preload_libraries=','-w','start']);assert r.returncode==0
 assert Path(t.read("SELECT current_setting('data_directory')")).resolve()==cluster.resolve()
 verified=json.loads(t.read((D/'2026101706-proforma-conversion-VERIFY.sql').read_text(encoding='utf-8')));assert verified['status']=='COMMITTED_SECURITY_PASS'
 (E/'exact-verifier-result.json').write_text(json.dumps(verified,indent=2))
 before=t.financial();audit=t.read("SELECT md5(coalesce(string_agg(to_jsonb(l)::text,E'\\n' ORDER BY document_id),'')) FROM proforma_backend.sale_links l")
 t.sql((D/'2026101706-proforma-conversion-ROLLBACK.sql').read_text(encoding='utf-8'))
 assert t.read("SELECT NOT has_function_privilege('authenticated','public.proforma_conversion_commit_v1(uuid,uuid,uuid,uuid,jsonb,jsonb)','EXECUTE') AND NOT has_function_privilege('authenticated','public.proforma_conversion_preview_v1(uuid,uuid,uuid)','EXECUTE')")=='t'
 assert before==t.financial() and audit==t.read("SELECT md5(coalesce(string_agg(to_jsonb(l)::text,E'\\n' ORDER BY document_id),'')) FROM proforma_backend.sale_links l")
 (E/'rollback-result.json').write_text(json.dumps({'status':'PASS','newEntrypointsDisabled':True,'financialStockCreditFingerprintsUnchanged':True,'auditLinksPreserved':True,'remoteConnections':0},indent=2))
 print('Exact read-only verifier PASS; revoke-only rollback PASS; financial/stock/credit/audit records preserved.')
finally:t.pg.tool('pg_ctl',['-D',str(cluster),'-m','fast','-w','stop'])
