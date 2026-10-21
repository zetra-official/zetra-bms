"""Stage an explicit public local M3 checkpoint. Never stage private runtime or credentials."""
from pathlib import Path
import subprocess,json,re
E=Path(__file__).resolve().parent;root=E.parent.parent
assert not subprocess.check_output(['git','diff','--cached','--name-only'],cwd=root,text=True).strip(),'Existing index must remain untouched'
prior=json.loads((E/'COMBINED-LOCAL-MANIFEST.json').read_text())
files={E/p for p in prior['hashes']}
for platform in ['web','android']:
 files.update((E/f'source-{platform}/src/precision').glob('*.ts'))
 files.add(E/f'source-{platform}/src/incoming/PrecisionEditor.tsx');files.add(E/f'source-{platform}/app/(tabs)/products.tsx')
names=['2026102104-precision-price.DRAFT.sql','build_local.py','extend_precision_sql.py','implement_precision.py','finish_precision_ui.py','polish_receipt.py','finalize_workspace_ui.py','finish_calculator_languages.py','apply_precision.py','test_staff_db.py','test_precision_db.py','test_standard_master.py','test_master_api.py','test_legacy_master.py','test_master_pos_isolation.py','test_staff_legacy_gap.py','restore_staff_positive_fixture.py','render_master_receipts.cjs','verify_master_pdf.py','precision.test.cjs','checkpoint_master.py','gateway.cjs','STAFF-POSTGRES-RESULTS.json','PRECISION-POSTGRES-RESULTS.json','STANDARD-MASTER-RESULTS.json','MASTER-API-RESULTS.json','MASTER-API-INITIAL.json','MASTER-LEGACY-REGRESSION.json','MASTER-POS-ISOLATION-RESULTS.json','STAFF-LEGACY-GAP-RESULTS.json','MASTER-PDF-RESULTS.json','PRECISION-UNIT.log','PRECISION-LANGUAGES.log','master-incoming-unit.log','master-language-final.log','precision-apply.log']
files.update(E/n for n in names)
for p in files:
 assert p.is_file() and '.private' not in p.name
 if p.suffix not in ['.zip','.png','.pdf']:
  assert not re.search(rb'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.',p.read_bytes()),'Credential-like data in '+p.name
args=[str(p.relative_to(root)).replace('\\','/') for p in sorted(files)]
subprocess.run(['git','add','-f','--',*args],cwd=root,check=True)
staged=subprocess.check_output(['git','diff','--cached','--name-only'],cwd=root,text=True).splitlines();assert all(p.startswith('engineering/incoming-m3-20261021/') for p in staged)
print('Staged only explicit M3 source/tests and public evidence:',len(staged),'files')
