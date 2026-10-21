from pathlib import Path
import zipfile,hashlib,json,difflib
E=Path(__file__).resolve().parent;R=E.parent.parent;D=R/'engineering/currency-workspace-fix-20261020'
changes=[]
for platform,expected in [('web','e183cc9949551bec7f78f0fd87df3d3454c538ab2947dd353fc2e053df5d1223'),('android','103835e086c1f1184c9df878fcdd1246129fd8036be95eefe252342300de0397')]:
 zpath=D/f'workspace-recovery-{platform}-source.zip'
 assert hashlib.sha256(zpath.read_bytes()).hexdigest()==expected
 target=E/f'source-{platform}'
 if not target.exists():
  with zipfile.ZipFile(zpath) as z:
   for entry in z.infolist():
    dest=(target/entry.filename).resolve();assert dest.is_relative_to(target.resolve())
   z.extractall(target)
 patches={
 'app/(tabs)/index.tsx': [('const stockPromise = supabase.rpc("get_stock_on_hand_value_v1", {\n        p_org_id: orgId,\n        p_store_id: storeId,\n      } as any);','const stockPromise = isOwner ? supabase.rpc("get_stock_on_hand_value_v1", {\n        p_org_id: orgId,\n        p_store_id: storeId,\n      } as any) : Promise.resolve({data:null,error:null} as any);')],
 'app/(tabs)/settings/business-statement.tsx':[('.from("products")','.from("m2_owner_products")'),('const tableCandidates = ["sale_items", "sales_items"];','const tableCandidates = ["m2_owner_sale_items"];')],
 'app/stores/supplier-detail.tsx':[
  ('const { activeOrgId } = useOrg() as any;','const { activeOrgId, activeRole } = useOrg() as any;\n  const isOwner=String(activeRole??"").trim().toLowerCase()==="owner";'),
  ('const debtRes = await supabase.rpc("get_supplier_debt_history_v1", {\n        p_supplier_id: supplierId,\n      });','const debtRes = isOwner ? await supabase.rpc("get_supplier_debt_history_v1", {\n        p_supplier_id: supplierId,\n      }) : {data:[],error:null};'),
  ('[activeOrgId, supplierId, supplierNameParam]','[activeOrgId, supplierId, supplierNameParam, isOwner]'),
  ('        <Card style={{ gap: 10 }}>\n          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>\n            {uiText("Supplier Debt Summary")}','        {isOwner && <Card style={{ gap: 10 }}>\n          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>\n            {uiText("Supplier Debt Summary")}'),
  ('        </Card>\n\n        {loading ? (','        </Card>}\n\n        {loading ? (')],
 'app/finance/business-debts.tsx':[
  ('const load = useCallback(async () => {','const load = useCallback(async () => {\n    if(!isOwner){setRows([]);setSummary(EMPTY_SUMMARY);setSelectedDebt(null);setLoading(false);return;}'),
  ('  }, [orgId, storeId]);\n\n  useEffect','  }, [orgId, storeId, isOwner]);\n\n  useEffect'),
  ('  return (\n    <Screen','  if(!isOwner) return <Screen><Text>{uiText("Owner only")}</Text></Screen>;\n  return (\n    <Screen')],
 'app/stocks/inbound.tsx':[
  ('  const orgCtx = useOrg() as any;','  const orgCtx = useOrg() as any;\n  const isOwner=String(orgCtx.activeRole??"").trim().toLowerCase()==="owner";'),
  ('  const fmt = useCallback(','  const fmtSell = useCallback('),
  ('    [money.currency, money.locale]\n  );','    [money.currency, money.locale]\n  );\n  const fmt=useCallback((n:number)=>isOwner?fmtSell(n):"—",[isOwner,fmtSell]);'),
  ('fmt(Number(x.proposed_sell_price || 0))','fmtSell(Number(x.proposed_sell_price || 0))'),
  ('fmt(Number(p.selling_price || 0))','fmtSell(Number(p.selling_price || 0))',2),
  ('fmt(x.proposed_sell_price)','fmtSell(x.proposed_sell_price)'),
  ('<Button title={uiText("Add Incoming Order")} onPress={() => setOpenAdd(true)} />','<Button title={uiText("Add Incoming Order")} disabled={!isOwner} onPress={() => setOpenAdd(true)} />'),
  ('visible={openAdd}','visible={openAdd && isOwner}'),('visible={fullEditOpen}','visible={fullEditOpen && isOwner}'),('visible={!!editingItem}','visible={!!editingItem && isOwner}')],
 }
 for file,pairs in patches.items():
  p=target/file;original=p.read_text(encoding='utf-8');result=original
  for pair in pairs:
   a,b,*expected=pair
   if b in result:continue
   assert result.count(a)==(expected[0] if expected else 1),(platform,file,a[:50]);result=result.replace(a,b)
  if result!=original:
   p.write_text(result,encoding='utf-8')
   (E/(platform+'-'+p.name+'.diff')).write_text(''.join(difflib.unified_diff(original.splitlines(True),result.splitlines(True),fromfile=file,tofile=file)),encoding='utf-8')
  changes.append({'platform':platform,'file':file,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(E/'SOURCE-CHANGES.json').write_text(json.dumps(changes,indent=2))
print('Separate released Web/Android baselines prepared; root application files preserved')
