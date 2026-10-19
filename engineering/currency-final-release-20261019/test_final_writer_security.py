from pathlib import Path
import sys,json,uuid,shutil,hashlib,concurrent.futures
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019';l.E=N/('disposable-writer-security-'+str(uuid.uuid4()));l.E.mkdir();l.CLUSTER=l.E/'cluster';src=N/'disposable-native-v2'
q=lambda s:"'"+str(s).replace("'","''")+"'";owner=str(uuid.uuid5(uuid.NAMESPACE_URL,'zetra-normal-proforma-1'));auth='SET ROLE coordinated_client;SET request.jwt.claims='+q(json.dumps({'sub':owner}))+';'
checks=[]
def ck(name,v):assert v,name;checks.append(name)
try:
 assert not(src/'postmaster.pid').exists() and not list((src/'pg_tblspc').iterdir()) and not any(p.is_symlink() for p in src.rglob('*'))
 shutil.copytree(src,l.CLUSTER);l.PORT=l.start()
 fingerprint="SELECT md5(coalesce(string_agg(v::text,'' ORDER BY k,id),'')) FROM(SELECT 'sales' k,id::text,to_jsonb(s) v FROM public.sales s UNION ALL SELECT 'items',id::text,to_jsonb(s) FROM public.sale_items s UNION ALL SELECT 'payments',id::text,to_jsonb(s) FROM public.sale_payments s UNION ALL SELECT 'wallets',id::text,to_jsonb(s) FROM public.field_wallets s UNION ALL SELECT 'walletTransactions',id::text,to_jsonb(s) FROM public.field_wallet_transactions s) x"
 historical=l.sql(fingerprint)[1]
 old_legacy_acl=l.sql("SELECT coalesce(proacl::text,'DEFAULT') FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='create_sale_with_payment_v6'")[1]
 l.sql((E/'2026101915-canonical-field-custody.DRAFT.sql').read_text());l.sql((E/'2026101916-original-workflow-readers.DRAFT.sql').read_text())
 ck('install preserves all existing local TZS/native sale/item/payment/wallet histories',historical==l.sql(fingerprint)[1])
 ck('existing application v6 ACL unchanged by new migrations',old_legacy_acl==l.sql("SELECT coalesce(proacl::text,'DEFAULT') FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='create_sale_with_payment_v6'")[1])
 names=['original_refunds','original_refund_payments','refund_stock_intents','bound_field_wallets','field_custody_links','field_custody_intents']
 for name in names:
  ck(name+' FORCE RLS',l.sql("SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid="+q('backend_core.'+name)+'::regclass')[1]=='t')
  for role in ['anon','authenticated','service_role']:
   ck(name+' denies '+role,l.sql("SELECT NOT has_table_privilege("+q(role)+','+q('backend_core.'+name)+",'SELECT,INSERT,UPDATE,DELETE')")[1]=='t')
 functions=['refund_original_sale_v1','confirm_bound_field_wallet_v1','open_bound_field_wallet_v1','post_bound_field_custody_v1','get_original_refund_sale_v1','get_bound_field_custody_v1','freeze_original_return_sources_v1','guard_bound_wallet_v1','check_bound_wallet_v1','stamp_bound_field_supplier_v1','stamp_bound_wallet_transaction_v1','stamp_bound_field_expense_v1']
 for name in functions:
  ck(name+' denies all nonowner execution',l.sql("SELECT count(*)=0 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.proname="+q(name)+' AND a.grantee<>p.proowner')[1]=='t')
 s=json.loads((E/'ORIGINAL-REFUND-EVIDENCE-RESULTS.json').read_text())['scenarios'][0]
 meta=json.loads(l.sql("SELECT json_build_object('store',store_id,'org',organization_id,'line',(SELECT id FROM public.sale_items WHERE sale_id=s.id LIMIT 1)) FROM public.sales s WHERE s.id="+q(s['saleId']))[1]);store=meta['store'];sale=s['saleId'];line=meta['line'];evidence=q(json.dumps({'source':'OWNER_CONFIRMED','reference':'LOCAL_CONCURRENT_REFUND_TEST'}))+'::jsonb'
 l.sql('UPDATE backend_core.settlement_rollout SET enabled=true WHERE organization_id='+q(meta['org'])+';GRANT EXECUTE ON FUNCTION public.refund_original_sale_v1(uuid,uuid,uuid,uuid,numeric,boolean,uuid,jsonb) TO coordinated_client;')
 commands=[auth+'SELECT public.refund_original_sale_v1('+','.join([q(store),q(str(uuid.uuid4())),q(sale),q(line),'2','true','NULL',evidence])+')' for _ in range(2)]
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda command:l.sql(command,False),commands))
 ck('concurrent refunds: exactly one commits',sorted(r[0]==0 for r in results)==[False,True])
 ck('concurrent loser denied by original quantity',any('REFUND_QUANTITY_EXCEEDS_ORIGINAL' in r[2] for r in results))
 ck('concurrent quantity and stock refund recorded once',l.sql('SELECT count(*)=1 AND sum(quantity)=2 FROM backend_core.original_refunds WHERE sale_id='+q(sale))[1]=='t')
 ck('return stock source immutable',l.sql('UPDATE public.stock_movements SET note=\'MUTATION\' WHERE id=(SELECT movement_id FROM backend_core.original_refunds WHERE sale_id='+q(sale)+')',False)[0]!=0)
 ck('original sale item immutable after evidence',l.sql('UPDATE public.sale_items SET qty=qty+1 WHERE id='+q(line),False)[0]!=0)
 ck('original refund fact immutable',l.sql('UPDATE backend_core.original_refunds SET quantity=3 WHERE sale_id='+q(sale),False)[0]!=0)
 ck('Funding Control source authority remains advances-only deny',l.sql("SELECT pg_get_functiondef('funding_control.source_ready(uuid)'::regprocedure) LIKE '%SELECT false%'")[1]=='t')
 ck('missing original evidence denies historical refund',l.sql(auth+'SELECT public.refund_original_sale_v1('+','.join([q(store),q(str(uuid.uuid4())),q(str(uuid.uuid4())),q(line),'1','false','NULL',evidence])+')',False)[0]!=0)
 before=l.sql("SELECT md5(coalesce(string_agg(to_jsonb(r)::text,'' ORDER BY id),'')) FROM backend_core.original_refunds r")[1]
 l.sql((E/'1916-DISABLE.sql').read_text());l.sql((E/'1915-DISABLE.sql').read_text());l.sql((E/'1914-DISABLE.sql').read_text())
 ck('deny-only rollback retains original refund facts',before==l.sql("SELECT md5(coalesce(string_agg(to_jsonb(r)::text,'' ORDER BY id),'')) FROM backend_core.original_refunds r")[1])
 ck('disable removes test-role refund access',l.sql("SELECT NOT has_function_privilege('coordinated_client','public.refund_original_sale_v1(uuid,uuid,uuid,uuid,numeric,boolean,uuid,jsonb)','EXECUTE')")[1]=='t')
 tzs=next(x for x in json.loads((N/'NATIVE-RESULTS.json').read_text())['scenarios'] if x['currency']=='TZS')
 legacy_sig=l.sql("SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='create_sale_with_payment_v6'")[1]
 legacy='BEGIN;GRANT EXECUTE ON FUNCTION '+legacy_sig+' TO coordinated_client;'+auth+'SELECT sale_id FROM public.create_sale_with_payment_v6(p_store_id:='+q(tzs['storeId'])+',p_items:='+q(json.dumps([{'product_id':tzs['productId'],'qty':1,'unit_price':13}]))+"::jsonb,p_payment_method:='CASH',p_paid_amount:=13,p_client_sale_id:="+q(str(uuid.uuid4()))+');ROLLBACK;'
 code,out,err=l.sql(legacy,False);assert code==0,err;ck('legacy TZS v6 behavior passes with rollback-only local fixture grant and rollout disabled',True)
 (E/'FINAL-WRITER-SECURITY-RESULTS.json').write_text(json.dumps({'status':'PASS','count':len(checks),'checks':checks,'scope':'Independent disposable clone; actual concurrent transactions, RLS/ACL, legacy TZS compatibility and deny-only rollback; synthetic Auth','productionWrites':False,'migrations':[{'path':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [E/'2026101914-atomic-original-refund.DRAFT.sql',E/'2026101915-canonical-field-custody.DRAFT.sql',E/'2026101916-original-workflow-readers.DRAFT.sql']]},indent=2));print(json.dumps({'status':'PASS','count':len(checks)}))
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
