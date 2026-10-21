"""Seal the local review delta, never runtime secrets or hosted release artifacts."""
from pathlib import Path
import hashlib,json,zipfile,subprocess,re,struct
E=Path(__file__).resolve().parent;root=E.parent.parent;M=E.parent/'security-owner-privacy-m2-20261021'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
prior=json.loads((E/'COMBINED-LOCAL-MANIFEST.json').read_text())
source={p for p in prior['hashes'] if p.startswith('source-')}
for platform in ['web','android']:
 source.update(str(p.relative_to(E)).replace('\\','/') for p in (E/f'source-{platform}/src/precision').glob('*.ts'))
 source.update([f'source-{platform}/src/incoming/PrecisionEditor.tsx',f'source-{platform}/src/incoming/savedReceiving.ts',f'source-{platform}/app/(tabs)/products.tsx'])
source=sorted(source)
builds={}
for platform in ['web','android']:
 b=json.loads((E/f'MASTER-BUILD-{platform.upper()}.json').read_text());assert b['status']=='PASS' and b['sourceInputs']
 for name,h in b['sourceInputs'].items():assert sha(E/f'source-{platform}'/name)==h,(platform,name,'source drift')
 for name,h in b['files'].items():assert sha(E/b['directory']/name)==h,(platform,name,'artifact drift')
 builds[platform]={'descriptor':f'MASTER-BUILD-{platform.upper()}.json','directory':b['directory'],'fileCount':len(b['files']),'sourceCount':len(b['sourceInputs']),'sha256':sha(E/f'MASTER-BUILD-{platform.upper()}.json')}
assert json.loads((E/'MASTER-PRESERVATION.json').read_text())['pass']
for n in ['UNIFIED-PRICE-RESULTS.json','UNIFIED-BOUNDARY-RESULTS.json','UNIFIED-API-RESULTS.json','SAVED-UI-RECONCILIATION.json']:
 assert json.loads((E/n).read_text())['fail']==0,n
pdf=json.loads((E/'MASTER-PDF-RESULTS.json').read_text());assert pdf['fail']==0 and pdf['visualReview']=='PASS'
def archive(path,entries):
 with zipfile.ZipFile(path,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
  for name,data in sorted(entries.items()):
   info=zipfile.ZipInfo(name,date_time=(2026,10,21,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16;z.writestr(info,data)
preimages={};new=[]
for platform in ['web','android']:
 with zipfile.ZipFile(M/f'M2-{platform}-source.zip') as z:
  for path in [p for p in source if p.startswith(f'source-{platform}/')]:
   suffix=path.split('/',1)[1];matches=[n for n in z.namelist() if n==suffix or n.endswith('/'+suffix)]
   assert len(matches)<=1,(path,matches)
   if matches:preimages[path]=z.read(matches[0])
   else:new.append(path)
archive(E/'MASTER-M2-PREIMAGES.zip',preimages)
index={'base':'sealed M2 source archives','existing':{p:hashlib.sha256(v).hexdigest() for p,v in preimages.items()},'newM3Paths':sorted(new),'localOnly':True}
(E/'MASTER-M2-PREIMAGES-INDEX.json').write_text(json.dumps(index,indent=2))
with zipfile.ZipFile(E/'MASTER-M2-PREIMAGES.zip') as z:assert all(hashlib.sha256(z.read(p)).hexdigest()==h for p,h in index['existing'].items())
ui={'localOnly':True,'genuineAuth':True,'desktopWeb':'PASS','bulkPrecisionDraftReloadAndImmediateReceipt':'PASS','finalSavedPartialAndFullHeaderAndQuantities':'PASS','finalSavedUnitReceipt':'PASS','staffPersonalTotalsAndWorkspace':'PASS','mobileTabletActualViewport':'NOT TESTED — override did not change actual 1280px DOM width','physicalAndroid':'NOT TESTED','iPhone':'NOT TESTED','nativePrintShare':'NOT TESTED','nativeExport':'PASS — not physical-device acceptance','screenshots':{}}
for stem in ['MASTER-RECEIPT-DESKTOP','MASTER-STAFF-DESKTOP','MASTER-SAVED-PARTIAL-DESKTOP','MASTER-SAVED-FULL-DESKTOP','MASTER-SAVED-RECEIPT-DESKTOP']:
 p=E/(stem+'.png');width,height=struct.unpack('>II',p.read_bytes()[16:24]);ui['screenshots'][p.name]={'width':width,'height':height,'sha256':sha(p)}
(E/'MASTER-UI-RESULTS.json').write_text(json.dumps(ui,indent=2))
names=['2026102102-incoming-m3.DRAFT.sql','2026102103-staff-operational.DRAFT.sql','2026102104-precision-price.DRAFT.sql','2026102105-unified-price.DRAFT.sql','MASTER-COMBINED-REPORT.md','MASTER-LOCAL-ROLLBACK.md','MASTER-M2-PREIMAGES.zip','MASTER-M2-PREIMAGES-INDEX.json','MASTER-UI-RESULTS.json','MASTER-PRESERVATION.json','MASTER-PDF-RESULTS.json','MASTER-API-RESULTS.json','STAFF-POSTGRES-RESULTS.json','STAFF-LEGACY-GAP-RESULTS.json','PRECISION-POSTGRES-RESULTS.json','STANDARD-MASTER-RESULTS.json','MASTER-POS-ISOLATION-RESULTS.json','MASTER-LEGACY-REGRESSION.json','UNIFIED-PRICE-RESULTS.json','UNIFIED-BOUNDARY-RESULTS.json','UNIFIED-API-RESULTS.json','UNIFIED-UNIT.log','SAVED-UI-RECONCILIATION.json','MASTER-BUILD-WEB.json','MASTER-BUILD-ANDROID.json','unified-typecheck-web.log','unified-typecheck-android.log','master-build-web.log','master-build-android.log']
for stem in ui['screenshots']:names.extend([stem,stem.replace('.png','.txt')])
names.extend(str(p.relative_to(E)).replace('\\','/') for p in (E/'output/pdf').glob('*.pdf'))
names.extend(str(p.relative_to(E)).replace('\\','/') for p in (E/'output/pdf').glob('*page-*.png'))
paths=sorted(set(source+names));entries={}
for name in paths:
 p=E/name;assert p.is_file() and '.private' not in name
 data=p.read_bytes()
 if p.suffix not in ['.pdf','.png','.zip']:assert not re.search(rb'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.',data),'Credential-like content: '+name
 entries[name]=data
archive(E/'MASTER-LOCAL-REVIEW-SOURCE.zip',entries)
manifest={'status':'COMBINED PARTIAL — LOCAL REVIEW ONLY','implementationCheckpoint':'b82f0640','previousCheckpoint':'4db62c5d','sourceFiles':len(source),'sourcePaths':source,'noHostedActions':True,'sqlDependencies':['sealed M2 owner privacy','2026102102','2026102103','2026102104','2026102105'],'hashes':{p:sha(E/p) for p in paths},'builds':builds,'archive':{'file':'MASTER-LOCAL-REVIEW-SOURCE.zip','sha256':sha(E/'MASTER-LOCAL-REVIEW-SOURCE.zip')},'rollbackArchive':{'file':'MASTER-M2-PREIMAGES.zip','sha256':sha(E/'MASTER-M2-PREIMAGES.zip')},'M2BaseArchives':{p.name:sha(p) for p in [M/'M2-web-source.zip',M/'M2-android-source.zip']},'unverified':['different acquisition-cost basis','shared/global store-specific price updates','full purchase payment/funding reconciliation','legacy collection cross-ledger linkage','multi-tab draft conflict','revised saved-order snapshot editing','genuine mobile/tablet runtime','physical Android/iPhone','native Print/Share']}
(E/'MASTER-LOCAL-MANIFEST.json').write_text(json.dumps(manifest,indent=2))
checks=['MASTER-LOCAL-MANIFEST.json','MASTER-LOCAL-REVIEW-SOURCE.zip','MASTER-M2-PREIMAGES.zip','MASTER-COMBINED-REPORT.md']
(E/'MASTER-SHA256SUMS.txt').write_text('\n'.join(sha(E/p)+'  '+p for p in checks)+'\n')
print(json.dumps({'sourceFiles':len(source),'reviewFiles':len(paths),'archiveSha256':manifest['archive']['sha256'],'preimagesVerified':len(preimages),'builds':'PASS; exact sources and artifact files rehashed','localOnly':True},indent=2))
