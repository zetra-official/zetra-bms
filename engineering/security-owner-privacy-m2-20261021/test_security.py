from pathlib import Path
import json,sys,re,hashlib
sys.dont_write_bytecode=True
import local_runtime as l
E=l.E; checks=[]
def check(name,ok):
    checks.append({'name':name,'status':'PASS' if ok else 'FAIL'})
    if not ok:raise AssertionError(name)
def read(q):return l.db.sql(q)[1]
def uid(n):return f'21000000-0000-4000-8000-{n:012d}'
ORG=uid(100);OTHER=uid(101);STORE=uid(200);STORE2=uid(201);FOREIGNSTORE=uid(202)
PRODUCT=uid(300);SUPPLIER=uid(400);ORDER=uid(500);ITEM=uid(501);DEBT=uid(600)
actors={'owner':1,'admin':2,'staff':3,'cashier':4,'no_membership':5,'other_org':6,'unassigned':7,'inactive':8,'anon':None}
def as_actor(name,q,ok=True):
    a=actors[name];role='anon' if a is None else 'authenticated'
    sql=f"BEGIN;SET LOCAL ROLE {role};SELECT set_config('request.jwt.claim.sub','{uid(a) if a else ''}',true);{q};ROLLBACK;"
    code,out,err=l.db.sql(sql,False)
    if ok and code:raise AssertionError(name+': '+err[-1600:])
    return code,out,err
def denied(name,q):
    r=as_actor(name,q,False);return r[0]!=0 and ('42501' in r[2] or 'permission denied' in r[2] or 'ACCESS_REQUIRED' in r[2] or 'SCOPE_REQUIRED' in r[2])
def setup():
    # Replay exact schema and auth-helper ACLs; old snapshot intentionally revoked these.
    q=[]
    for s in json.loads((E/'schema-acls.private.json').read_text()):
        q.append(f'REVOKE ALL ON SCHEMA {s["nspname"]} FROM PUBLIC,anon,authenticated;')
        for entry in s['acl'].strip('{}').split(','):
            role,permissions=entry.split('=',1)
            if role in ['','anon','authenticated'] and 'U' in permissions.split('/')[0]:q.append(f'GRANT USAGE ON SCHEMA {s["nspname"]} TO {role or "PUBLIC"};')
    for f in json.loads((E/'auth-helpers.private.json').read_text()):
        q.append(f['definition'].replace('\r','').rstrip().rstrip(';')+';')
        q.append(f'REVOKE ALL ON FUNCTION {f["identity"]} FROM PUBLIC,anon,authenticated;')
        for entry in (f['acl'] or '{=X/postgres}').strip('{}').split(','):
            role,permissions=entry.split('=',1)
            if role in ['','anon','authenticated'] and 'X' in permissions.split('/')[0]:q.append(f'GRANT EXECUTE ON FUNCTION {f["identity"]} TO {role or "PUBLIC"};')
    l.db.sql('\n'.join(q))
    # Exact baseline functions, table ACLs and policies, not simplified replacement engines.
    l.db.sql('SET check_function_bodies=off;'+(E/'function-preimages.LOCAL-RESTORE.sql').read_text(encoding='utf-8'))
    changed={x['identity'] for x in json.loads((E/'FUNCTION-CHANGE-MANIFEST.json').read_text())}
    dependencies={'get_store_inventory_v2','ensure_my_store_access','_is_owner_in_org','_is_owner_or_admin_in_org','has_store_access'}
    live_functions=json.loads((E/'functions.private.json').read_text(encoding='utf-8'))
    policy_calls=set(re.findall(r'\b([a-zA-Z_]\w*)\s*\(',str(json.loads((E/'policies.private.json').read_text()))))
    dependencies.update(f['name'] for f in live_functions if f['schema']=='public' and f['name'] in policy_calls)
    acl=[]
    for f in json.loads((E/'functions.private.json').read_text(encoding='utf-8')):
        if f['identity'] not in changed and f['name'] not in dependencies:continue
        if f['name'] in dependencies:acl.append(f['definition'].replace('\r','').rstrip().rstrip(';')+';')
        acl.append(f'REVOKE ALL ON FUNCTION public.{f["identity"]} FROM PUBLIC,anon,authenticated;')
        entries=(f['acl'] or '{=X/postgres}').strip('{}').split(',')
        for entry in entries:
            role,permissions=entry.split('=',1)
            if 'X' in permissions.split('/')[0]:acl.append(f'GRANT EXECUTE ON FUNCTION public.{f["identity"]} TO {role or "PUBLIC"};')
    l.db.sql('\n'.join(acl))
    grants=json.loads((E/'grants.private.json').read_text())
    l.db.sql('\n'.join(f'GRANT {g["privilege_type"]} ON public."{g["table_name"]}" TO {g["grantee"]};' for g in grants if g['table_schema']=='public' and g['table_name'] in ['org_memberships','org_membership_stores','organizations','stores'] and g['grantee'] in ['anon','authenticated','PUBLIC']))
    tables={'products','sale_items','inventory','inventory_movements','stock_movements','_backup_inventory_before_fix_stock_root','inbound_stock_orders','inbound_stock_items','inbound_stock_payments','inbound_stock_audit','business_debts','business_debt_payments','field_wallets','field_wallet_transactions','ai_daily_store_snapshots_v1','notifications','sale_delete_audit_v1'}
    policies=json.loads((E/'policies.private.json').read_text())
    existing=json.loads(read("SELECT coalesce(json_agg(json_build_object('table',tablename,'policy',policyname)),'[]') FROM pg_policies WHERE schemaname='public'"))
    q=[]
    for p in existing:
        if p['table'] in tables:q.append(f'DROP POLICY "{p["policy"]}" ON public."{p["table"]}";')
    for p in policies:
        if p['schemaname']!='public' or p['tablename'] not in tables:continue
        roles=p['roles'].strip('{}').split(',')
        q.append(f'CREATE POLICY "{p["policyname"]}" ON public."{p["tablename"]}" AS {p["permissive"]} FOR {p["cmd"]} TO '+','.join(roles)+(f' USING ({p["qual"]})' if p['qual'] else '')+(f' WITH CHECK ({p["with_check"]})' if p['with_check'] else '')+';')
    relations=json.loads((E/'relations.private.json').read_text())
    for t in tables:
        live=next(x for x in relations if x['schema']=='public' and x['name']==t)
        q.append(f'ALTER TABLE public."{t}" '+('ENABLE' if live['relrowsecurity'] else 'DISABLE')+' ROW LEVEL SECURITY;')
        q.append(f'GRANT ALL ON public."{t}" TO anon,authenticated;')
    l.db.sql('\n'.join(q))
    # Synthetic identities only, inserted into this new disposable cluster.
    seed=[f"SELECT set_config('request.jwt.claim.sub','{uid(1)}',false);"]
    for n in range(1,9):seed.append(f"INSERT INTO auth.users(id,email) VALUES('{uid(n)}','m2-{n}@example.invalid') ON CONFLICT(id) DO NOTHING;")
    seed += [f"INSERT INTO public.organizations(id,name,created_by) VALUES('{ORG}','M2 SYNTHETIC','{uid(1)}'),('{OTHER}','M2 OTHER','{uid(6)}') ON CONFLICT(id) DO NOTHING;"]
    for s,o,kind in [(STORE,ORG,'STANDARD'),(STORE2,ORG,'FIELD_PROCUREMENT'),(FOREIGNSTORE,OTHER,'STANDARD')]:
        seed.append(f"INSERT INTO public.stores(id,organization_id,name,store_type) VALUES('{s}','{o}','M2 synthetic {kind}','{kind}') ON CONFLICT(id) DO NOTHING;")
    for name,n in actors.items():
        if n is None or name=='no_membership':continue
        role=name if name in ['owner','admin','staff','cashier'] else ('owner' if name in ['other_org','inactive'] else 'staff')
        org=OTHER if name=='other_org' else ORG
        seed.append(f"INSERT INTO public.org_memberships(id,organization_id,user_id,role,is_active) VALUES('{uid(1000+n)}','{org}','{uid(n)}','{role}',{'false' if name=='inactive' else 'true'}) ON CONFLICT(id) DO NOTHING;")
        if name in ['staff','cashier']:
            for s in [STORE,STORE2]:seed.append(f"INSERT INTO public.org_membership_stores(membership_id,store_id) VALUES('{uid(1000+n)}','{s}') ON CONFLICT DO NOTHING;")
    seed += [f"INSERT INTO public.products(id,organization_id,store_id,name,sku,barcode,cost_price,selling_price) VALUES('{PRODUCT}','{ORG}','{STORE}','M2 Synthetic 商品 منتج','M2-SKU','M2-BARCODE',51,101) ON CONFLICT(id) DO NOTHING;",
    f"INSERT INTO public.inventory(organization_id,store_id,product_id,qty) VALUES('{ORG}','{STORE}','{PRODUCT}',10) ON CONFLICT(store_id,product_id) DO NOTHING;",
    f"INSERT INTO public.suppliers(id,organization_id,name) VALUES('{SUPPLIER}','{ORG}','M2 Supplier') ON CONFLICT(id) DO NOTHING;",
    f"INSERT INTO public.inbound_stock_orders(id,organization_id,store_id,supplier_id,supplier_name,order_code,status,total_goods_value,total_paid_amount,total_balance_amount,created_by) VALUES('{ORDER}','{ORG}','{STORE}','{SUPPLIER}','M2 Supplier','M2-ONLY-500','IN_TRANSIT',102,0,102,'{uid(1)}') ON CONFLICT(id) DO NOTHING;",
    f"INSERT INTO public.inbound_stock_items(id,inbound_order_id,organization_id,product_id,product_name,sku,barcode,qty_ordered,qty_received,unit_cost,proposed_sell_price,total_cost) VALUES('{ITEM}','{ORDER}','{ORG}','{PRODUCT}','M2 Synthetic 商品 منتج','M2-SKU','M2-BARCODE',2,0,51,101,102) ON CONFLICT(id) DO NOTHING;",
    f"INSERT INTO public.business_debts(id,organization_id,store_id,lender_name,principal_amount,paid_amount,created_by) VALUES('{DEBT}','{ORG}','{STORE}','M2 Supplier',102,0,'{uid(1)}') ON CONFLICT(id) DO NOTHING;",
    f"INSERT INTO public.stock_movements(id,organization_id,store_id,product_id,mode,amount,unit_cost,total_cost,note,created_by) VALUES('{uid(700)}','{ORG}','{STORE}','{PRODUCT}','ADD',10,51,510,'confidential cost 51','{uid(1)}') ON CONFLICT(id) DO NOTHING;"]
    seed += [f"INSERT INTO public.field_cycles(id,organization_id,store_id,title,target_amount,status,opened_by) VALUES('{uid(800)}','{ORG}','{STORE2}','M2 Synthetic cycle',100,'OPEN','{uid(1)}') ON CONFLICT(id) DO NOTHING;",
    f"INSERT INTO public.field_wallets(id,organization_id,store_id,membership_id,balance,created_by,is_active) VALUES('{uid(801)}','{ORG}','{STORE2}','{uid(1003)}',100,'{uid(1)}',true) ON CONFLICT(id) DO NOTHING;"]
    l.db.sql('\n'.join(seed))
def fingerprint():
    return read(f"SELECT md5(string_agg(x.s,'' ORDER BY x.s)) FROM (SELECT to_jsonb(t)::text s FROM public.products t WHERE organization_id='{ORG}' UNION ALL SELECT to_jsonb(t)::text FROM public.inventory t WHERE organization_id='{ORG}' UNION ALL SELECT to_jsonb(t)::text FROM public.business_debts t WHERE organization_id='{ORG}') x")
try:
    l.start();setup()
    check('exact live stock-in anonymous leak reproduced',as_actor('anon',f"SELECT count(*) FROM public.get_stock_in_items_v2('{ORG}','{STORE}',current_date,current_date) WHERE product_id='{PRODUCT}'")[1].splitlines()[-1]=='1')
    check('exact live anonymous autocomplete acquisition-cost leak reproduced', '51' in as_actor('anon',f"SELECT cost_price FROM public.get_inbound_stock_suggestions_v1('{ORG}','{STORE}','M2-SKU')")[1])
    check('exact live Admin debt leak reproduced','102' in as_actor('admin',f"SELECT principal_amount FROM public.get_business_debts('{ORG}','{STORE}')")[1])
    check('exact live Admin POS cost leak reproduced','51' in as_actor('admin',f"SELECT cost_price FROM public.get_store_sale_items('{STORE}')")[1])
    check('exact live exposed backup privilege reproduced',read("SELECT has_table_privilege('anon','public._backup_inventory_before_fix_stock_root','SELECT') AND NOT relrowsecurity FROM pg_class WHERE oid='public._backup_inventory_before_fix_stock_root'::regclass")=='t')
    check('exact live NULL-role allocation bypass reproduced',as_actor('no_membership',f"SELECT public.allocate_field_wallet_v1('{STORE2}','{uid(1003)}',1)")[0]==0)
    check('exact live unrelated caller field expense bypass reproduced',as_actor('no_membership',f"SELECT public.record_field_expense_v1('{STORE2}','{uid(1003)}',1)")[0]==0)
    fp=fingerprint()
    l.db.sql((E/'2026102101-owner-privacy.DRAFT.sql').read_text(encoding='utf-8'))
    check('draft DDL leaves original financial and inventory amounts unchanged',fp==fingerprint())
    for name in actors:
        check(name+' raw backup denied',denied(name,'SELECT * FROM public._backup_inventory_before_fix_stock_root'))
        check(name+' direct inventory write denied',denied(name,f"UPDATE public.inventory SET qty=999 WHERE store_id='{STORE}'"))
        check(name+' direct movements write denied',denied(name,f"DELETE FROM public.stock_movements WHERE store_id='{STORE}'"))
        if name=='owner':
            check('Owner authorized acquisition-cost read','51' in as_actor(name,f"SELECT cost_price FROM public.m2_owner_products WHERE id='{PRODUCT}'")[1])
            check('Owner authorized debt read','102' in as_actor(name,f"SELECT principal_amount FROM public.get_business_debts('{ORG}','{STORE}')")[1])
        else:
            check(name+' protected direct column denied',denied(name,f"SELECT cost_price FROM public.products WHERE id='{PRODUCT}'"))
            check(name+' debt RPC denied',denied(name,f"SELECT * FROM public.get_business_debts('{ORG}','{STORE}')"))
            check(name+' cost valuation RPC denied',denied(name,f"SELECT public.get_stock_on_hand_value_v1('{ORG}','{STORE}')"))
            check(name+' field allocation denied',denied(name,f"SELECT public.allocate_field_wallet_v1('{STORE2}','{uid(1003)}',1)"))
            check(name+' field expense denied',denied(name,f"SELECT public.record_field_expense_v1('{STORE2}','{uid(1003)}',1)"))
        if name in ['owner','admin','staff','cashier']:
            r=as_actor(name,f"SELECT product_name||':'||selling_price||':'||qty FROM public.get_store_inventory_v2('{STORE}')")[1]
            check(name+' legitimate operational inventory retained',':101:10' in r)
            r=as_actor(name,f"SELECT coalesce(cost_price::text,'REDACTED') FROM public.get_store_sale_items('{STORE}')")[1]
            check(name+' POS price privacy',('51' in r) if name=='owner' else 'REDACTED' in r)
            r=as_actor(name,f"SELECT coalesce(unit_cost::text,'REDACTED') FROM public.get_stock_in_items_v2('{ORG}','{STORE}',current_date,current_date)")[1]
            check(name+' stock-in quantity reader privacy',('51' in r) if name=='owner' else 'REDACTED' in r)
        else:
            check(name+' unauthorized store RPC denied',denied(name,f"SELECT * FROM public.get_stock_in_items_v2('{ORG}','{STORE}',current_date,current_date)"))
            if name!='anon':check(name+' raw operational inventory rows hidden',as_actor(name,f"SELECT count(*) FROM public.inventory WHERE store_id='{STORE}'")[1].splitlines()[-1]=='0')
    check('Owner cannot value foreign store',denied('owner',f"SELECT public.get_stock_on_hand_value_v1('{ORG}','{FOREIGNSTORE}')"))
    check('Owner cannot read foreign organization',denied('owner',f"SELECT * FROM public.get_business_debts('{OTHER}')"))
    historical=l.db.sql(f"BEGIN;UPDATE public.stores SET is_active=false WHERE id='{STORE}';SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','{uid(1)}',true);SELECT public.get_stock_on_hand_value_v1('{ORG}','{STORE}') IS NOT NULL;ROLLBACK;",False)
    check('Owner retains authorized historical valuation for inactive store',historical[0]==0 and historical[1].splitlines()[-1]=='t')
    check('Admin raw debt rows invisible',as_actor('admin',f"SELECT count(*) FROM public.business_debts WHERE organization_id='{ORG}'")[1].splitlines()[-1]=='0')
    check('historical notification payload allowlist',read("SELECT security_m2.operational_json('{\"name\":\"商品 منتج\",\"qty\":2,\"note\":\"cost 51\",\"unit_cost\":51,\"nested\":{\"profit\":100}}'::jsonb)::text")=='{"qty": 2, "name": "商品 منتج"}')
    # Cross-org parent/child linkage rejected even when called by a definer.
    r=l.db.sql(f"BEGIN;UPDATE public.inbound_stock_items SET organization_id='{OTHER}' WHERE id='{ITEM}';ROLLBACK;",False)
    check('incoming child parent org mismatch rejected',r[0]!=0 and 'INBOUND_PARENT_SCOPE_' in r[2])
    r=l.db.sql(f"BEGIN;UPDATE public.inbound_stock_orders SET store_id='{FOREIGNSTORE}' WHERE id='{ORDER}';ROLLBACK;",False)
    check('incoming foreign store mismatch rejected',r[0]!=0 and 'INBOUND_SCOPE_' in r[2])
    check('security tests did not change originals',fp==fingerprint())
    for actor in ['owner','admin']:
        check(actor+' existing partial receive RPC retained',as_actor(actor,f"SELECT public.receive_inbound_stock_partial_v1('{ORDER}','[{{\"item_id\":\"{ITEM}\",\"qty\":1}}]'::jsonb)")[0]==0)
        check(actor+' existing full receive RPC retained',as_actor(actor,f"SELECT public.receive_inbound_stock_v1('{ORDER}')")[0]==0)
    check('Owner canonical wallet allocation retained',as_actor('owner',f"SELECT public.allocate_field_wallet_v1('{STORE2}','{uid(1003)}',1)")[0]==0)
    check('Owner canonical wallet expense retained',as_actor('owner',f"SELECT public.record_field_expense_v1('{STORE2}','{uid(1003)}',1)")[0]==0)
    check('Owner existing incoming payment declaration retained',as_actor('owner',f"SELECT public.record_inbound_stock_payment_v1('{ORDER}',1,'CASH','M2-SYNTHETIC-ONLY')")[0]==0)
    for actor in ['owner','admin','staff','cashier']:
        output=as_actor(actor,f"SELECT body::text FROM public.get_my_notifications_v3('{STORE}',60)")[1]
        check(actor+' historical notification free-text privacy',('confidential cost 51' in output) if actor=='owner' else 'confidential cost 51' not in output)
    # Every Owner-guarded public function is attacked with actual SQL roles and JWT identity.
    owner_functions=[x for x in json.loads((E/'FUNCTION-CHANGE-MANIFEST.json').read_text()) if x['policy']=='OWNER']
    catalog={x['identity']:x for x in json.loads((E/'functions.private.json').read_text(encoding='utf-8'))}
    for actor in [n for n in actors if n!='owner']:
        blocks=[]
        for f in owner_functions:
            definition=catalog[f['identity']]['definition'].replace('\r','')
            params=re.findall(r'\b(p_\w+)\s+(uuid\[\]|uuid|timestamp with time zone|numeric|text|jsonb|date|integer|boolean)',definition.split(' RETURNS ')[0])
            args=[]
            for param,typ in params:
                if param in ['p_org_id','p_organization_id']:value=f"'{ORG}'::uuid"
                elif param=='p_store_id':value=f"'{STORE}'::uuid"
                elif param=='p_order_id':value=f"'{ORDER}'::uuid"
                elif param=='p_item_id':value=f"'{ITEM}'::uuid"
                elif param=='p_debt_id':value=f"'{DEBT}'::uuid"
                elif param=='p_supplier_id':value=f"'{SUPPLIER}'::uuid"
                elif param=='p_cycle_id':value=f"'{uid(800)}'::uuid"
                else:value='NULL::'+typ
                args.append(value)
            call='public.'+f['identity'].split('(')[0]+'('+','.join(args)+')'
            blocks.append(f"DO $m2$ BEGIN BEGIN PERFORM {call}; EXCEPTION WHEN insufficient_privilege THEN RETURN; END; RAISE EXCEPTION 'M2_EXPECTED_DENIAL'; END $m2$;")
        as_actor(actor,'\n'.join(blocks))
        check(actor+' all '+str(len(owner_functions))+' Owner-only RPC entry points reject',True)
    check('rolled-back workflow tests preserve original synthetic quantities and amounts',fp==fingerprint())
    quarantined=json.loads((E/'CLIENT-QUARANTINE.json').read_text())
    for f in quarantined:
        check('trusted job body preserved '+f['identity'],read("SELECT md5(replace(pg_get_functiondef('public."+f['identity']+"'::regprocedure),chr(13),''))")==hashlib.md5(catalog[f['identity']]['definition'].replace('\r','').encode()).hexdigest())
        for role in ['anon','authenticated']:
            check(role+' cannot invoke internal job '+f['identity'],read("SELECT NOT has_function_privilege('"+role+"','public."+f['identity']+"','EXECUTE')")=='t')
except Exception as exc:
    checks.append({'name':'execution','status':'FAIL','error':str(exc)})
    raise
finally:
    (E/'SECURITY-TEST-RESULTS.json').write_text(json.dumps({'sqlSHA256':hashlib.sha256((E/'2026102101-owner-privacy.DRAFT.sql').read_bytes()).hexdigest(),'checks':checks,'pass':sum(x['status']=='PASS' for x in checks),'fail':sum(x['status']=='FAIL' for x in checks),'localOnly':True,'hostedWrites':False},ensure_ascii=False,indent=2),encoding='utf-8')
    l.stop()
print('PASS '+str(len(checks))+' local PostgreSQL security checks')
