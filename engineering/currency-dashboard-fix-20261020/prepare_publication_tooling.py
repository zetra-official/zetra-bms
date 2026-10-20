from pathlib import Path
E=Path(__file__).resolve().parent;old=E.parent/'currency-only-20261020'
p=(old/'execute_approved_release.py').read_text(encoding='utf-8').replace('PRODUCTION-APPROVAL.json','REPLACEMENT-APPROVAL.json').replace('ZETRA-CURRENCY-DISPLAY-20261020','ZETRA-CURRENCY-DISPLAY-DASHBOARD-FIX-20261020').replace('25fd815b10906511f6237739d250bb57eb0a15bc','6f343efcf5d668d343bc8c824efb5716ee490d84').replace('25fd815b','6f343efc')
p=p.replace("assert read(D/'web-production-smoke.json')['status']=='PASS','WEB_SMOKE_REQUIRED'","assert read(D/'web-production-smoke.json')['status']=='PASS','WEB_SMOKE_REQUIRED'\n assert read(D/'web-product-ui-smoke.json')['status']=='PASS','ACTUAL_WEB_DASHBOARD_FINANCE_REQUIRED'")
p=p.replace("original=read(E/'production-preimage-readonly.json')","original=read(R/'engineering/currency-only-20261020/production-preimage-readonly.json')")
assert not (E/'execute_approved_release.py').exists();(E/'execute_approved_release.py').write_text(p,encoding='utf-8')
for name in ['web_release_smoke.py','production_fx_smoke.cjs']:
 assert not (E/name).exists();(E/name).write_bytes((old/name).read_bytes())
print('Exact replacement publication tooling prepared; no source/artifact mutation')
