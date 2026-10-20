from pathlib import Path
import json,zipfile,hashlib,shutil,re
R=Path.cwd();E=Path(__file__).resolve().parent;OLD=R/'engineering/currency-only-20261020'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
approval=json.loads((OLD/'PRODUCTION-APPROVAL.json').read_text(encoding='utf-8'))
def patch(text):
 assert 'DashboardCurrency' not in text
 text="import {DashboardCurrency} from '@/src/currency/DashboardCurrency';\n"+text
 # Remove the two former guarded Dashboard entries; the universal entry now
 # owns all platform branches. Preserve all existing financial read/write code.
 text,n=re.subn(r'\{isDesktopWeb && !desktopLoading && desktopValuationScope===JSON.stringify\(\[orgId,storeId\]\) && <LegacyTzsValuation[^\n]+?/\>\}', '<DashboardCurrency />',text);assert n==1
 text,n=re.subn(r'\{!loading && !err && valuationScope===JSON.stringify\(\[orgId,storeId\]\) && <LegacyTzsValuation[^\n]+?/\>\}', '',text);assert n==1
 return text
for platform in ['web','android']:
 archive=OLD/('currency-only-'+platform+'-source.zip');assert sha(archive)==approval['sha256'][archive.name]
 dest=E/('release-source-'+platform);assert not dest.exists(),'PRESERVE_CANDIDATE_STOP'
 with zipfile.ZipFile(archive) as z:
  assert all(not Path(n).is_absolute() and '..' not in Path(n).parts for n in z.namelist());z.extractall(dest)
 before={p.relative_to(dest).as_posix():sha(p) for p in dest.rglob('*') if p.is_file()}
 rel='app/(tabs)/index.tsx';p=dest/rel;p.write_text(patch(p.read_text(encoding='utf-8')),encoding='utf-8')
 for rel in ['src/currency/DashboardCurrency.tsx','src/currency/dashboardValuation.ts']:
  shutil.copy2(R/rel,dest/rel)
 after={p.relative_to(dest).as_posix():sha(p) for p in dest.rglob('*') if p.is_file()}
 changes={rel:{'before':before.get(rel),'after':h} for rel,h in after.items() if before.get(rel)!=h}
 assert set(changes)=={'app/(tabs)/index.tsx','src/currency/DashboardCurrency.tsx','src/currency/dashboardValuation.ts'}
 (E/('isolated-'+platform+'-source-manifest.json')).write_text(json.dumps({'baselinePackage':approval['id'],'baselineArchiveSha256':sha(archive),'changes':changes,'allSourceFiles':after,'productionSql':[],'publication':False},indent=2),encoding='utf-8')
 print(platform,': Dashboard-only source delta verified')
# Patch only the same insertion/removal in the mixed checkout; no replacement
# of its unrelated pre-existing Dashboard implementation.
p=R/'app/(tabs)/index.tsx';text=p.read_text(encoding='utf-8')
if 'DashboardCurrency' not in text:
 (E/'root-dashboard-before.private.tsx').write_bytes(p.read_bytes());p.write_text(patch(text),encoding='utf-8')
