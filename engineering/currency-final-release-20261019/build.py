from pathlib import Path
import json,re,hashlib
E=Path(__file__).resolve().parent;prior=E.parent/'native-financial-contracts-20261019/2026101905-native-settlement-atomic.DRAFT.sql'
assert hashlib.sha256(prior.read_bytes()).hexdigest()=='f9f849d7eb43844d8da92cf3c44bc51d8b9603b2c9d896eb2ab6d6e8aa35f3d4'
capture=re.search(r'CREATE OR REPLACE FUNCTION backend_core.capture_financial_currency_v1\(\).*?END \$\$;',prior.read_text(),re.S).group()
old='  RETURN NEW;\n END IF;';assert capture.count(old)==1
capture=capture.replace(old,"  IF OLD.currency_context->>'currency'<>'TZS' THEN\n   PERFORM backend_core.native_financial_policy_v1(NEW.store_id);\n   IF NOT EXISTS(SELECT 1 FROM backend_core.native_financial_intents i JOIN proforma_backend.accounting_currency a ON a.organization_id=i.organization_id WHERE i.backend_pid=pg_backend_pid() AND i.transaction_id=txid_current() AND i.actor_id=backend_core.active_subject() AND i.store_id=NEW.store_id AND a.currency=OLD.currency_context->>'currency' AND a.revision=(OLD.currency_context->>'contextRevision')::integer) THEN RAISE EXCEPTION 'NATIVE_MUTATION_REQUIRES_ATOMIC_CONTRACT';END IF;\n  END IF;\n  RETURN NEW;\n END IF;")
row=next(r for r in json.loads((E/'CANONICAL-CONTRACTS.json').read_text()) if r['identity'].startswith('create_expense_v2('));digest=hashlib.md5(row['definition'].replace('\r','').encode()).hexdigest()
guard="DO $$BEGIN IF md5(replace(pg_get_functiondef('public."+row['identity']+"'::regprocedure),chr(13),''))<>'"+digest+"' THEN RAISE EXCEPTION 'EXPENSE_CANONICAL_PREIMAGE_MISMATCH';END IF;END$$;"
dep=json.loads((E/'1906-DEPENDENCY.json').read_text());quote=lambda s:"'"+s.replace("'","''")+"'"
guard+="\nDO $$BEGIN IF md5(replace(pg_get_functiondef('backend_core.capture_financial_currency_v1()'::regprocedure),chr(13),''))<>"+quote(dep['captureMd5'])+" OR (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='backend_core.native_financial_requests'::regclass AND conname='native_financial_requests_operation_check') IS DISTINCT FROM "+quote(dep['operationConstraint'])+" THEN RAISE EXCEPTION 'NATIVE_1905_DEPENDENCY_DRIFT';END IF;END$$;"
sql="BEGIN;SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='45s';\n"+guard+'\n'+capture+'\n'+(E/'1906-expense.sql').read_text()+'\nCOMMIT;\n'
p=E/'2026101906-native-expense-integrity.DRAFT.sql';p.write_text(sql,encoding='utf-8');(E/'1906-SHA256.txt').write_text(hashlib.sha256(p.read_bytes()).hexdigest());print(hashlib.sha256(p.read_bytes()).hexdigest())
