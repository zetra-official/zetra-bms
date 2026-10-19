from pathlib import Path
import hashlib,json,re
E=Path(__file__).resolve().parent
guards=[];definitions=[]
for row in json.loads((E/'1908-GATEWAY-PREIMAGES.json').read_text()):
 definition=row['definition'].replace('\r','');digest=hashlib.md5(definition.encode()).hexdigest();guards.append("IF md5(replace(pg_get_functiondef('"+row['identity']+"'::regprocedure),chr(13),''))<>'"+digest+"' THEN RAISE EXCEPTION 'INTENT_GATEWAY_PREIMAGE_MISMATCH';END IF;")
 guards.append("IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='"+row['identity']+"'::regprocedure AND a.grantee<>p.proowner) THEN RAISE EXCEPTION 'UNEXPECTED_GATEWAY_ACTIVATION';END IF;")
 operation={'create_native_sale_v1':'SALE','repay_native_credit_v1':'REPAYMENT','native_cashier_shift_v1':'SHIFT','create_native_expense_v1':'EXPENSE'}[row['identity'].split('(')[0]]
 pattern=r'INSERT INTO backend_core.native_financial_intents VALUES\(pg_backend_pid\(\),txid_current\(\),actor,o,p_store_id,p_request_id\);';assert len(re.findall(pattern,definition))==1
 definitions.append(re.sub(pattern,"INSERT INTO backend_core.native_financial_intents VALUES(pg_backend_pid(),txid_current(),actor,o,p_store_id,p_request_id,'"+operation+"');",definition)+';')
sql="BEGIN;SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='30s';\nDO $$BEGIN "+''.join(guards)+"END$$;\nALTER TABLE backend_core.native_financial_intents ADD COLUMN operation text CHECK(operation IN ('SALE','REPAYMENT','SHIFT','EXPENSE'));\n"+'\n'.join(definitions)+'\n'+(E/'1908-boundaries.sql').read_text()+'\nCOMMIT;\n'
p=E/'2026101908-native-writer-quarantine.DRAFT.sql';p.write_text(sql,encoding='utf-8');(E/'1908-SHA256.txt').write_text(hashlib.sha256(p.read_bytes()).hexdigest());print(hashlib.sha256(p.read_bytes()).hexdigest())
