from pathlib import Path
import sys,json,socket,uuid
sys.path.insert(0,str(Path('scripts/backend').resolve()));import test_local as t
O=Path('engineering/release/proforma-currency-final');f=json.loads((O/'postgres-result.json').read_text())['fixture'];E=t.BASE/'main-project-release/proforma-normal';cluster=max((p for p in E.glob('clone-*') if p.is_dir() and not(p/'postmaster.pid').exists()),key=lambda p:p.stat().st_ctime)
with socket.socket() as s:s.bind(('127.0.0.1',0));t.PORT=s.getsockname()[1]
r=t.pg.tool('pg_ctl',['-D',str(cluster),'-l',str(cluster.with_suffix('.fx-rollback.log')),'-o',f'-h 127.0.0.1 -p {t.PORT} -c archive_mode=off -c shared_preload_libraries=','-w','start']);assert r.returncode==0
try:
 q=t.lit;doc=f['document']['id'];org=f['organizationId'];store=f['storeId'];actor=f['revision']['createdBy'];before=t.read('SELECT revision FROM proforma_backend.documents WHERE id='+q(doc));request=str(uuid.uuid4());financial=t.financial();args=','.join([q(org),q(store),q(request),q(doc),before,q(json.dumps({'currency':'TZS','rate':'2500','source':'Rollback injection synthetic','acknowledged':True}))+'::jsonb'])
 sql="BEGIN;CREATE FUNCTION pg_temp.reject_fx_event() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'INJECTED_FX_EVENT';END$$;CREATE TRIGGER reject_fx_event BEFORE INSERT ON proforma_backend.events FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_fx_event();SET ROLE coordinated_client;SET request.jwt.claims="+q(json.dumps({'sub':actor}))+";SELECT public.proforma_document_fx_v1("+args+');COMMIT;'
 r=t.sql(sql,ok=False);assert r.returncode and 'INJECTED_FX_EVENT' in r.stderr;assert before==t.read('SELECT revision FROM proforma_backend.documents WHERE id='+q(doc));assert t.read('SELECT count(*) FROM proforma_backend.requests WHERE organization_id='+q(org)+' AND request_id='+q(request))=='0';assert financial==t.financial();post=t.read((t.ROOT/'supabase/backend-review/20261017/2026101705-proforma-fx-VERIFY.sql').read_text());assert 'COMMITTED_QUOTE_ONLY_API_PASS' in post
 result={'status':'PASS','checks':['failedFxRevisionRolledBack','requestReceiptRolledBack','financialFingerprintUnchanged','independentPostflightPass'],'remoteConnections':0};(O/'rollback-postflight-result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
finally:t.pg.tool('pg_ctl',['-D',str(cluster),'-m','fast','-w','stop'])
