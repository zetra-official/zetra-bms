"""Read-only verification followed by new local release copies. No network/publication."""
from pathlib import Path
import hashlib,json,re,zipfile,shutil
E=Path(__file__).resolve().parent;R=E.parent.parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
norm=lambda s:(s or '').replace('\r\n','\n')
old=read(R/'engineering/currency-final-release-20261019/catalog-only/baseline.private.map')
new=read(next((E/'isolated-android-build').rglob('*.map')))
a=dict(zip(old['sources'],old['sourcesContent']));b=dict(zip(new['sources'],new['sourcesContent']))
manifest=read(E/'isolated-android-source-manifest.json')
changed=[k for k in b if k in a and norm(b[k])!=norm(a[k])]
added=[k for k in b if k not in a];removed=[k for k in a if k not in b]
assert not removed,removed
ctx=next(k for k in a if k.startswith('/app?ctx'))
keys=lambda s:set(re.findall(r'^  "([^"\n]+)":',s,re.M))
assert keys(b[ctx])-keys(a[ctx])=={'./finance/exchange-rates.tsx'}
assert not keys(a[ctx])-keys(b[ctx])
base=str(R).replace('\\','\\\\');candidate=str(E/'release-source-android').replace('\\','\\\\')
filtered='\n'.join(line for line in b[ctx].splitlines() if '"./finance/exchange-rates.tsx"' not in line).replace(candidate,base)
assert filtered==a[ctx].rstrip('\n'),'ROUTE_CONTEXT_UNEXPECTED_CHANGE'
for k in changed:
    if k==ctx:continue
    assert k.lstrip('/') in manifest['changes'],('UNSCOPED_SOURCE',k)
    assert not k.startswith('/node_modules/'),('CHANGED_DEPENDENCY',k)
for k in added:
    assert k.startswith('/node_modules/@noble/hashes/') or k.lstrip('/') in manifest['changes'],('UNSCOPED_ADDITION',k)
assert norm(a['/app/catalog.tsx'])==norm(b['/app/catalog.tsx'])
for word in ['create_native_sale_v1','create_native_expense_v1','post_original_refund','settlement_binding']:
    assert not any(word in (b[k] or '') for k in added+changed),word
assert sha(R/'app/catalog.tsx')=='a6b548a9567803d9db181b4d6f236349b55afddfc115ead7ba9f6d449c1b4914'
result={'status':'PASS','normalizedLineEndings':True,'changedModules':changed,'addedModules':added,'removedModules':removed,'unrelatedDependencyChanges':False,'catalogMatchesPublished':True,'unfinishedFinancialRpcLeak':False,'routeAddition':'finance/exchange-rates only','publication':False}
(E/'release-isolation-verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
artifacts={}
for platform in ['web','android']:
    source=E/('release-source-'+platform);m=read(E/('isolated-'+platform+'-source-manifest.json'))
    for rel,h in m['allSourceFiles'].items():assert sha(source/rel)==h,('SOURCE_DRIFT',platform,rel)
    build=E/('isolated-'+platform+'-build');log=(E/('isolated-'+platform+'-build.log')).read_text(encoding='utf-8')
    assert 'Exported:' in log or 'Exported ' in log
    target=E/('release-artifact-'+platform)
    assert not target.exists(),'PRESERVE_SEALED_ARTIFACT_STOP'
    files={}
    for p in build.rglob('*'):
        if not p.is_file() or p.suffix=='.map':continue
        rel=p.relative_to(build).as_posix();assert '.private.' not in rel
        dest=target/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest);files[rel]=sha(dest)
    if platform=='web':
        rules=(target/'_redirects').read_text(encoding='utf-8')
        assert rules.index('/api/reference-fx/bot')<rules.index('/* /index.html')
        assert rules.index('/api/reference-fx/ecb')<rules.index('/* /index.html')
    archive=E/('currency-only-'+platform+'-source.zip')
    assert not archive.exists(),'PRESERVE_SOURCE_ARCHIVE_STOP'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
        for rel in sorted(m['allSourceFiles']):
            assert 'node_modules/' not in rel and not rel.startswith('.env') and '.private.' not in rel
            z.write(source/rel,rel)
    artifacts[platform]={'files':files,'sourceArchive':archive.name,'sourceArchiveSha256':sha(archive),'sourceManifestSha256':sha(E/('isolated-'+platform+'-source-manifest.json')),'privateMapsExcluded':True}
(E/'SEALED-ARTIFACTS.json').write_text(json.dumps(artifacts,indent=2),encoding='utf-8')
print('Source isolation and exact local artifacts sealed; no publication')
