from pathlib import Path
E=Path(__file__).resolve().parent
for platform in ['web','android']:
 p=E/f'source-{platform}/app/(tabs)/index.tsx';s=p.read_text(encoding='utf-8');old='<StoreGuard><StaffOperationalDashboard key={JSON.stringify([orgId,storeId,roleLower])}/></StoreGuard>'
 assert old in s;s=s.replace(old,'<><WorkspaceCard activeOrgName={activeOrgName} activeRole={activeRole} activeStoreName={activeStoreName} activeStoreId={activeStoreId} onOpen={goOrgSwitcher}/><StoreGuard><StaffOperationalDashboard key={JSON.stringify([orgId,storeId,roleLower])}/></StoreGuard></>',1);p.write_text(s,encoding='utf-8')
p=E/'gateway.cjs';s=p.read_text(encoding='utf-8');s=s.replace("root=path.join(E,'build-master-web')","root=path.join(E,JSON.parse(fs.readFileSync(path.join(E,'MASTER-BUILD-WEB.json'),'utf8')).directory)")
s=s.replace('fs.createReadStream(f).pipe(res);',"const stream=fs.createReadStream(f);stream.on('error',()=>{res.destroy()});stream.pipe(res);");p.write_text(s,encoding='utf-8')
print('Canonical Staff workspace selector restored; gateway pins an immutable successful build')
