from pathlib import Path
import subprocess,json
E=Path(__file__).resolve().parent;R=E.parent.parent
names=['2026102106-products-price-compatibility.sql','correct_products_contract.py','finish_products_copy.py','apply_products_correction.py','test_products_correction.py','test_products_unit.cjs','PRODUCTS-CORRECTION-RESULTS.json','PRODUCTS-UNIT.log','MASTER-LEGACY-REGRESSION.json','MASTER-BUILD-WEB.json','MASTER-BUILD-ANDROID.json','build_production.cjs','finish_web_package.py','compose_release.py','rehearse_release.py','execute_sql.py','deploy_web.py','seal_production.py','reconcile_price_ui.py','seed_price_ui.py','preflight_current.py','preflight_dependencies.py','release_targets.py','checkpoint_correction.py']
names += [f'source-{platform}/src/incoming/{name}' for platform in ['web','android'] for name in ['BulkScreen.tsx','model.ts','copy.ts']]
names += ['production-20261021/'+n for n in ['RELEASE-NOTES.md','RELEASE.sql','ROLLBACK.sql','SQL-MANIFEST.json','SQL-REHEARSAL.json','EXPECTED-FUNCTIONS.json','RELEASE-MANIFEST.json','BUILD-web.json','BUILD-android.json','CATALOG-PREFLIGHT.json','DEPENDENCY-PREFLIGHT.json','TARGETS.json','PRICE-UI-RECONCILIATION.json','local-corrected-price.png']]
paths=[str((E/n).relative_to(R)) for n in names];assert all((R/p).is_file() for p in paths)
assert not any('.private.' in p for p in paths)
assert not subprocess.check_output(['git','diff','--cached','--name-only'],cwd=R,text=True).strip(),'Existing staged work must be preserved'
subprocess.run(['git','add','-f','--',*paths],cwd=R,check=True)
subprocess.run(['git','commit','-m','Fix Incoming current cost and selling prices through canonical Products contract'],cwd=R,check=True)
print(subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip())
