from pathlib import Path
import json
from decimal import Decimal
E=Path(__file__).resolve().parent;s=(E/'test_db.py').read_text(encoding='utf-8');exec(s[:s.index('\ntry:\n')],globals())
f=json.loads((E/'master-fixture.private.json').read_text());prefix=f['prefix'];u=json.loads((E/'UI-SAVED-FIXTURE.private.json').read_text());O=f['org'];order=u['order'];pid=u['product'];checks=[]
try:
 check('Genuine UI partial then full reached canonical RECEIVED',read(f"SELECT status FROM public.inbound_stock_orders WHERE id='{order}'")=='RECEIVED')
 check('Genuine UI received all 12 ordered base units',read(f"SELECT qty_received=12 FROM public.inbound_stock_items WHERE inbound_order_id='{order}'")=='t')
 check('Exactly 12 units added to pre-existing inventory',Decimal(read(f"SELECT qty FROM public.inventory WHERE store_id='{u['store']}' AND product_id='{pid}'"))==Decimal(u['beforeQty'])+12)
 check('Current selling price and unchanged original acquisition basis',read(f"SELECT selling_price=1300 AND cost_price=500 FROM public.products WHERE id='{pid}'")=='t')
 check('Two receiving executions have two exact six-unit events',read(f"SELECT count(*)=2 AND sum(m.amount)=12 AND min(m.amount)=6 AND max(m.amount)=6 FROM public.stock_movements m JOIN incoming_m3.saved_receives sr ON sr.event_id=m.event_id WHERE sr.order_id='{order}'")=='t')
 check('One receipt and one notification per receiving execution',read(f"SELECT count(*)=2 AND count(DISTINCT b.event_id)=2 FROM incoming_m3.saved_receives sr JOIN incoming_m3.batches b ON b.event_id=sr.event_id JOIN public.notifications n ON n.event_id=b.event_id WHERE sr.order_id='{order}'")=='t')
 check('Canonical supplier liability not duplicated',read(f"SELECT count(*) FROM public.business_debts WHERE note LIKE '%{order}%'")=='1')
 check('No payment or account deduction fabricated',read(f"SELECT count(*) FROM public.inbound_stock_payments WHERE inbound_order_id='{order}'")=='0')
 check('Historical sale price and COGS still original',read(f"SELECT unit_price=800 AND unit_cost=500 AND unit_cost_price=500 FROM public.sale_items WHERE sale_id='{U(700)}'")=='t')
 events=json.loads(read(f"SELECT jsonb_agg(event_id ORDER BY created_at) FROM incoming_m3.saved_receives WHERE order_id='{order}'"))
 (E/'UI-SAVED-EVENTS.private.json').write_text(json.dumps(events))
finally:
 out={'localOnly':True,'genuineBrowserActions':True,'checks':checks,'pass':sum(c['status']=='PASS' for c in checks),'fail':sum(c['status']=='FAIL' for c in checks)};(E/'SAVED-UI-RECONCILIATION.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
