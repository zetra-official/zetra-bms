from pathlib import Path
import subprocess,re,json
E=Path(__file__).resolve().parent;root=E.parent.parent
names=['2026102105-unified-price.DRAFT.sql','extend_unified_price.py','apply_unified_price.py','finish_unified_ui.py','localize_price_errors.py','fix_unit_receipt.py','fix_saved_web_confirm.py','test_unified_price.py','test_unified_boundaries.py','test_unified_api.py','test_unified_unit.cjs','unified.test.cjs','UNIFIED-PRICE-RESULTS.json','UNIFIED-BOUNDARY-RESULTS.json','UNIFIED-API-RESULTS.json','UNIFIED-UNIT.log','unified-price-apply.log','verify_master_preservation.py','MASTER-PRESERVATION.json','prepare_saved_ui.py','checkpoint_unified.py']
names += [f'source-{p}/src/incoming/savedReceiving.ts' for p in ['web','android']]
names += ['fix_receiving_refresh.py','verify_saved_ui.py','SAVED-UI-INITIAL-RECONCILIATION.json']
names += list(json.loads((E/'COMBINED-LOCAL-MANIFEST.json').read_text())['hashes'])
names += ['build_local.py','MASTER-PDF-RESULTS.json']
for platform in ['web','android']:
 names += [str(p.relative_to(E)).replace('\\','/') for p in (E/f'source-{platform}/src/precision').glob('*.ts')]
 names += [f'source-{platform}/src/incoming/PrecisionEditor.tsx',f'source-{platform}/app/(tabs)/products.tsx']
names=sorted(set(names))
files=[E/n for n in names]
for p in files:
 assert p.is_file() and '.private' not in p.name
 assert not re.search(rb'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.',p.read_bytes()),p
subprocess.run(['git','add','-f','--',*[str(p.relative_to(root)) for p in files]],cwd=root,check=True)
staged=subprocess.check_output(['git','diff','--cached','--name-only'],cwd=root,text=True).splitlines();assert all(p.startswith('engineering/incoming-m3-20261021/') for p in staged)
print('Explicit scoped M3 files staged:',len(staged))
