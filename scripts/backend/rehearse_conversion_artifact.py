"""Final exact-file DDL rehearsal; reuses accepted synthetic template, no functional suite repetition."""
from pathlib import Path
import sys,socket,json,uuid,shutil,hashlib
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path(__file__).parent));import test_local as t
base=t.BASE/'main-project-release/proforma-normal';source=max((p for p in base.glob('clone-*') if p.is_dir() and not(p/'postmaster.pid').exists()),key=lambda p:p.stat().st_ctime);cluster=base/('artifact-'+uuid.uuid4().hex);shutil.copytree(source,cluster)
with socket.socket() as s:s.bind(('127.0.0.1',0));t.PORT=s.getsockname()[1]
D=t.ROOT/'supabase/backend-review/20261017';migration=D/'2026101706-proforma-conversion.CANDIDATE.sql';report={'status':'FAIL','migrationSha256':hashlib.sha256(migration.read_bytes()).hexdigest(),'remoteConnections':0}
try:
 r=t.pg.tool('pg_ctl',['-D',str(cluster),'-l',str(cluster.with_suffix('.log')),'-o',f'-h 127.0.0.1 -p {t.PORT} -c archive_mode=off -c shared_preload_libraries=','-w','start']);assert r.returncode==0
 assert Path(t.read("SELECT current_setting('data_directory')")).resolve()==cluster.resolve()
 before=t.financial();t.sql(migration.read_text(encoding='utf-8'));verification=json.loads(t.read((D/'2026101706-proforma-conversion-VERIFY.sql').read_text(encoding='utf-8')))
 assert verification['status']=='COMMITTED_SECURITY_PASS' and before==t.financial()
 report.update(status='PASS',commit='CONFIRMED_LOCAL',verification=verification,businessRowsUnchanged=True)
finally:
 t.pg.tool('pg_ctl',['-D',str(cluster),'-m','fast','-w','stop']);report['stopped']=not(cluster/'postmaster.pid').exists();(t.ROOT/'engineering/release/proforma-conversion/exact-artifact-result.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
