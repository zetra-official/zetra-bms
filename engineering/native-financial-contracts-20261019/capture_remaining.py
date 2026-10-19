from pathlib import Path
import sys,json
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as l
E=Path(__file__).resolve().parent;l.E=E;l.CLUSTER=E/'disposable-native-v1'
try:
 l.PORT=l.start()
 sql="SELECT json_agg(json_build_object('name',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid))) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='public.sale_items'::regclass AND NOT t.tgisinternal";v=json.loads(l.sql(sql)[1]);(E/'COST-TRIGGERS.json').write_text(json.dumps(v,indent=2));print(json.dumps(v))
 print(l.sql("SELECT json_agg(json_build_object('currency',s.currency_context->>'currency','qty',i.qty,'unitCost',i.unit_cost,'unitCostPrice',i.unit_cost_price,'productCost',p.cost_price)) FROM public.sale_items i JOIN public.sales s ON s.id=i.sale_id JOIN public.products p ON p.id=i.product_id WHERE s.id IN(SELECT (result->>'saleId')::uuid FROM backend_core.native_financial_requests WHERE operation='SALE')")[1])
 names=json.loads(l.sql("SELECT coalesce(json_agg(p.oid::regprocedure::text ORDER BY p.proname),'[]') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','funding_canonical','funding_evidence') AND p.prokind='f' AND p.proname~'(refund|return|void_sale|cancel_sale|cash.*movement|procure|supplier|receipt)' ")[1]);(E/'REMAINING-CONTRACT-NAMES.json').write_text(json.dumps(names,indent=2));print(json.dumps(names))
finally:
 if l.PORT:l.tool('pg_ctl',['-D',str(l.CLUSTER),'-m','fast','-w','stop'])
