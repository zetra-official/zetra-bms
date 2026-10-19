from pathlib import Path
import subprocess,json,zipfile,re,hashlib,importlib.util
R=Path.cwd();D=Path(__file__).resolve().parent;E=D.parent
def command(args,name,timeout=90):
 p=subprocess.run(args,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=timeout);(D/(name+'.private.log')).write_text(p.stdout+'\n'+p.stderr,encoding='utf-8');assert p.returncode==0,name+'_FAILED';return p.stdout
adb='C:/Users/ZetraAdmin/AppData/Local/Android/Sdk/platform-tools/adb.exe'
apkpath=command([adb,'shell','pm','path','com.anonymous.zetrabmsclean'],'apk-path').strip().splitlines()[0].removeprefix('package:')
apk=D/'installed.private.apk';command([adb,'pull',apkpath,str(apk)],'apk-pull')
aapt='C:/Users/ZetraAdmin/AppData/Local/Android/Sdk/build-tools/36.0.0/aapt2.exe';xml=command([aapt,'dump','xmltree',str(apk),'--file','AndroidManifest.xml'],'apk-manifest')
lines=xml.splitlines();metadata=[]
for i,line in enumerate(lines):
 if 'expo.modules.updates' in line:metadata.append('\n'.join(lines[max(0,i-1):i+3]))
embedded=None
with zipfile.ZipFile(apk) as z:
 candidates=[n for n in z.namelist() if n.endswith('app.manifest') or n.endswith('expo-updates/manifest.json')]
 for name in candidates:
  try:embedded=json.loads(z.read(name));break
  except (ValueError,UnicodeDecodeError):pass
result={'installedPackage':'com.anonymous.zetrabmsclean','apkSha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'nativeUpdateMetadata':metadata,'embeddedRuntimeVersion':embedded.get('runtimeVersion') if embedded else None,'embeddedUpdateId':embedded.get('id') if embedded else None,'embeddedSdkVersion':embedded.get('sdkVersion') if embedded else None,'apkModified':False,'appLaunched':False,'deployment':False}
(D/'INSTALLED-APK-DELIVERY.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
s=importlib.util.spec_from_file_location('readonly_runtime',R/'engineering/global-currency-final-20261019/controls/common.py');c=importlib.util.module_from_spec(s);s.loader.exec_module(c);c.E=D
assert (R/'supabase/.temp/project-ref').read_text().strip()==c.REF
q=D/'CATALOG-CONTRACTS-READONLY.sql';q.write_text("""BEGIN READ ONLY;SET LOCAL statement_timeout='15s';SELECT jsonb_build_object('readOnly',current_setting('transaction_read_only'),'functions',(SELECT jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'acl',p.proacl,'owner',pg_get_userbyid(p.proowner))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('generate_product_catalog_share_v1','preview_product_catalog_share_v1','import_product_catalog_share_v1'))) metadata;ROLLBACK;""",encoding='utf-8')
v=c.query('catalog-contracts',q);assert v['readOnly']=='on';print('Production Catalog metadata captured read-only: '+str(len(v['functions'])))
