from pathlib import Path
import json,textwrap
E=Path(__file__).resolve().parent;s=(E/'test_db.py').read_text(encoding='utf-8');exec(s[:s.index('\ntry:\n')],globals());fixture=json.loads((E/'fixture.private.json').read_text());prefix=fixture['prefix'];O=fixture['org'];S=fixture['store'];SUP=fixture['supplier'];checks=[]
try:
 before=Decimal(read(f"SELECT qty FROM public.inventory WHERE product_id='{U(10001)}'"));p=payload(105);req=str(uuid.uuid4());barrier=threading.Barrier(2)
 def run_concurrent():barrier.wait();return rpc(p,req,commit=True)[1]
 with concurrent.futures.ThreadPoolExecutor(2) as pool:rs=list(pool.map(lambda _:run_concurrent(),range(2)))
 check('Concurrent duplicate requests both resolve consistently',all(r[0]==0 for r in rs) and result(rs[0])==result(rs[1]));event=result(rs[0])['eventId'];check('Concurrent retry one movement per line',read(f"SELECT count(*) FROM public.stock_movements WHERE event_id='{event}'")=='105');check('Concurrent retry one notification',read(f"SELECT count(*) FROM public.notifications WHERE event_id='{event}'")=='1');check('Concurrent retry increments stock once',Decimal(read(f"SELECT qty FROM public.inventory WHERE product_id='{U(10001)}'"))==before+2)
 (E/'receipt-owner.private.json').write_text(read(f"SELECT receipt FROM incoming_m3.batches WHERE event_id='{event}'"),encoding='utf-8');(E/'receiving-event.private.json').write_text(json.dumps({'eventId':event,'org':O,'store':S,'requestId':req}))
 # A deliberate late notification error must roll back every inventory and order write.
 sql("CREATE FUNCTION incoming_m3.test_late_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'M3_TEST_LATE_FAILURE'; END $$;CREATE TRIGGER m3_local_test_late_fail BEFORE INSERT ON public.notifications FOR EACH ROW WHEN(NEW.organization_id='"+O+"') EXECUTE FUNCTION incoming_m3.test_late_fail();")
 try:
  before=digest();orders=read(f"SELECT count(*) FROM public.inbound_stock_orders WHERE organization_id='{O}'");req,r=rpc(payload(105),commit=True);check('Deliberate late notification failure reached',r[0]!=0 and 'M3_TEST_LATE_FAILURE' in r[2]);check('Late failure leaves inventory/cost data unchanged',digest()==before);check('Late failure leaves no partial order or batch',read(f"SELECT count(*) FROM public.inbound_stock_orders WHERE organization_id='{O}'")==orders and read(f"SELECT count(*) FROM incoming_m3.batches WHERE request_id='{req}'")=='0')
 finally:sql('DROP TRIGGER m3_local_test_late_fail ON public.notifications;DROP FUNCTION incoming_m3.test_late_fail();')
 for actor in [1,2]:
  for kind,call in [('partial',f"public.receive_inbound_stock_partial_v1('{A(500)}','[{{\"item_id\":\"{A(501)}\",\"qty\":1}}]'::jsonb)"),('full',f"public.receive_inbound_stock_v1('{A(500)}')")]:
   r=sql(f"BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','{A(actor)}',true);SELECT {call};ROLLBACK;",False);check(f'Legacy actor {actor} {kind} receiving regression',r[0]==0)
 for role,subject in [('anon',''),('authenticated',A(2))]:
  r=sql(f"BEGIN;SET LOCAL ROLE {role};SELECT set_config('request.jwt.claim.sub','{subject}',true);SELECT * FROM incoming_m3.batches;ROLLBACK;",False);check(role+' cannot read private batch payloads',r[0]!=0 and 'permission denied' in r[2])
 for actor in [1,2,3,4]:
  r=sql(f"BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','{A(actor)}',true);SELECT count(*) FROM public.get_my_notifications_v1('{S}',200) WHERE title LIKE 'RCV-%';ROLLBACK;",False);check(f'Actor {actor} canonical notification reader usable',r[0]==0)
finally:
 out={'checks':checks,'pass':sum(c['status']=='PASS' for c in checks),'fail':sum(c['status']=='FAIL' for c in checks),'localOnly':True};(E/'CONCURRENCY-ATOMICITY-REGRESSION.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
