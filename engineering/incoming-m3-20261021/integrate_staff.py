from pathlib import Path
E=Path(__file__).resolve().parent
w=E/'source-web';a=E/'source-android'
p=w/'app/(tabs)/index.tsx';s=p.read_text(encoding='utf-8')
originalSource=s
assert 'StaffOperationalDashboard' not in s
s="import {StaffOperationalDashboard} from '../../src/staff/StaffOperationalDashboard';\n"+s
old='{isCapitalRecoveryStore ? (\n        <>'
assert old in s
s=s.replace(old,"{roleLower === 'staff' && !isCapitalRecoveryStore ? (\n        <StoreGuard><StaffOperationalDashboard key={JSON.stringify([orgId,storeId,roleLower])}/></StoreGuard>\n      ) : isCapitalRecoveryStore ? (\n        <>",1)
for start,end in [('  const loadDesktopSalesPerformance = useCallback(async () => {','  const desktopLoad = useCallback'),('  const desktopLoad = useCallback','  useEffect(() => {\n    if (!orgId) return;')]:
 i=s.index(start);j=s.index(end,i+len(start));part=s[i:j]
 assert 'if (!isDesktopWeb) return;' in part
 part=part.replace('if (!isDesktopWeb) return;',"if (!isDesktopWeb || roleLower === 'staff') return;",1)
 # dependencies always include current role, even same org/store role change.
 k=part.rfind(']);');assert k!=-1
 head=part[:k];separator='' if head.rstrip().endswith(',') else ','
 part=head+separator+' roleLower'+part[k:]
 s=s[:i]+part+s[j:]
p.write_text(s,encoding='utf-8')
# Mirror only the narrowly edited Home source; M2 platform Home copies were identical.
ap=a/'app/(tabs)/index.tsx';original=ap.read_text(encoding='utf-8')
assert original==originalSource
ap.write_text(s,encoding='utf-8')
for f in (w/'src/staff').glob('*'):
 (a/'src/staff').mkdir(exist_ok=True);(a/'src/staff'/f.name).write_bytes(f.read_bytes())
print('Isolated Web/Android Staff Home integration complete; root source untouched')
