"""Build additive1917 against the exact saved LOCAL dispatcher preimage."""
from pathlib import Path
import sys,json,hashlib
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path('engineering/currency-onboarding-20261018').resolve()));import local as db
E=Path(__file__).resolve().parent;N=E.parent/'native-financial-contracts-20261019'
runtime=json.loads((E/'ORIGINAL-WORKFLOW-SERVER.json').read_text())['runtimeId'];db.E=N/runtime;db.CLUSTER=db.E/'cluster'
assert db.E.resolve().parent==N.resolve()
db.PORT=int((db.CLUSTER/'postmaster.pid').read_text().splitlines()[3]);assert Path(db.sql("SELECT current_setting('data_directory')")[1]).resolve()==db.CLUSTER.resolve()
sig='public.post_bound_financial_v1(uuid,uuid,text,integer,text,jsonb,jsonb,uuid,jsonb)'
pre=json.loads(db.sql("SELECT json_build_object('definition',pg_get_functiondef("+"'"+sig+"'::regprocedure),'md5',md5(replace(pg_get_functiondef('"+sig+"'::regprocedure),chr(13),'')))")[1])
capture_sig='backend_core.capture_original_sale_evidence_v1(uuid,text)'
capture=json.loads(db.sql("SELECT json_build_object('definition',pg_get_functiondef('"+capture_sig+"'::regprocedure),'md5',md5(replace(pg_get_functiondef('"+capture_sig+"'::regprocedure),chr(13),'')))")[1])
old_creation="OR NOT EXISTS(SELECT 1 FROM public.sales WHERE id=s.id AND xmin=pg_current_xact_id()::text::xid)"
assert capture['definition'].count(old_creation)==1
capture_body=capture['definition'].replace(old_creation,"OR NOT backend_core.sale_created_in_current_posting_v1(s.id)")
body=pre['definition'];anchor=" ELSIF p_operation='COLLECTION' THEN";assert body.count(anchor)==1
body=body.replace(anchor," result:=result||jsonb_build_object('originalTaxEvidence',backend_core.capture_bound_sale_posting_facts_v1(rid));\n"+anchor)
create="  result:=public.create_native_sale_v1("
assert body.count(create)==1
body=body.replace(create,"  IF p_payload ?| ARRAY['tax','tax_rate','tax_amount','taxEvidence','taxAllocation','originalTax'] OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'items') x WHERE x ?| ARRAY['tax','tax_rate','tax_amount','taxEvidence','taxAllocation']) THEN RAISE EXCEPTION 'CLIENT_TAX_OVERRIDE_NOT_AUTHORITY';END IF;\n"+create)
header="-- LOCAL DRAFT1917. New-sale atomic original-tax capture hook; no rates or tax defaults.\nBEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='30s';\nDO $$BEGIN IF md5(replace(pg_get_functiondef('"+sig+"'::regprocedure),chr(13),''))<>'"+pre['md5']+"' THEN RAISE EXCEPTION '1917_DISPATCHER_PREIMAGE_MISMATCH';END IF;IF to_regprocedure('backend_core.capture_original_sale_evidence_v1(uuid,text)') IS NULL THEN RAISE EXCEPTION '1913_REQUIRED';END IF;END$$;\n"
header=header.replace('END$$;',"IF md5(replace(pg_get_functiondef('"+capture_sig+"'::regprocedure),chr(13),''))<>'"+capture['md5']+"' THEN RAISE EXCEPTION '1917_ORIGINAL_CAPTURE_PREIMAGE_MISMATCH';END IF;END$$;")
p=E/'2026101917-atomic-sale-tax-capture.DRAFT.sql';p.write_text(header+(E/'1917-sale-tax-capture.sql').read_text()+'\n'+capture_body.rstrip().rstrip(';')+';\n'+body.rstrip().rstrip(';')+';\nCOMMIT;\n')
(E/'1917-DEPENDENCY-PREIMAGE.json').write_text(json.dumps({'identity':sig,'md5':pre['md5'],'localRuntime':runtime,'originalCaptureIdentity':capture_sig,'originalCaptureMd5':capture['md5']},indent=2))
(E/'1917-DISABLE.sql').write_text("BEGIN;UPDATE backend_core.settlement_rollout SET enabled=false WHERE enabled;UPDATE backend_core.original_tax_capture_bindings SET enabled=false WHERE enabled;DO $$DECLARE r record;BEGIN FOR r IN SELECT DISTINCT pg_get_userbyid(a.grantee) role FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='"+sig+"'::regprocedure AND a.grantee<>0 AND a.grantee<>p.proowner LOOP EXECUTE format('REVOKE ALL ON FUNCTION "+sig+" FROM %I',r.role);END LOOP;END$$;REVOKE ALL ON FUNCTION "+sig+" FROM PUBLIC;COMMIT;\n")
print(json.dumps({'migration':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'dispatcherPreimage':pre['md5'],'productionWrites':False}))
