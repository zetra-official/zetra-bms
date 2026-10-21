from pathlib import Path
import json,sys
E=Path(__file__).resolve().parent;sys.path.insert(0,str(E.parent/'security-owner-privacy-m2-20261021'));import local_runtime as l
l.db.E=E;l.db.CLUSTER=E/'disposable';l.db.PORT=json.loads((E/'db.private.json').read_text())['port'];f=json.loads((E/'price-ui.private.json').read_text())
assert Path(l.db.sql("SELECT current_setting('data_directory')")[1].strip()).resolve()==(E/'disposable').resolve()
q=f"""SELECT jsonb_build_object('currentPrices',(SELECT cost_price=600 AND selling_price=1200 AND store_id IS NULL FROM public.products WHERE id='{f['product']}'),'destinationQuantity',(SELECT qty=22 FROM public.inventory WHERE product_id='{f['product']}' AND store_id='{f['store']}'),'otherStoreUntouched',(SELECT qty=7 FROM public.inventory WHERE product_id='{f['product']}' AND store_id='{f['otherStore']}'),'singleCanonicalMovement',(SELECT count(*)=1 FROM public.stock_movements WHERE product_id='{f['product']}' AND amount=12 AND unit_cost=600),'onePriceAudit',(SELECT count(*)=1 FROM incoming_m3.price_changes WHERE product_id='{f['product']}' AND previous_cost=500 AND new_cost=600 AND previous_price=1000 AND new_price=1200))"""
out=json.loads(l.db.sql(q)[1]);assert all(out.values()),out
(E/'production-20261021/PRICE-UI-RECONCILIATION.json').write_text(json.dumps({'status':'PASS','genuineLocalUI':True,'syntheticOnly':True,'checks':out},indent=2),encoding='utf-8');print(json.dumps(out))
