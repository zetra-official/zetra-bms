from pathlib import Path
import hashlib
E=Path(__file__).resolve().parent
sql="BEGIN;SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='30s';\nDO $$BEGIN IF to_regprocedure('public.create_native_expense_v1(uuid,uuid,text,integer,jsonb)') IS NULL OR to_regprocedure('backend_core.protect_native_expense_v1()') IS NULL THEN RAISE EXCEPTION 'VERIFIED_1906_REQUIRED';END IF;END$$;\n"+(E/'1907-reader.sql').read_text()+'\nCOMMIT;\n'
p=E/'2026101907-original-financial-readers.DRAFT.sql';p.write_text(sql,encoding='utf-8');(E/'1907-SHA256.txt').write_text(hashlib.sha256(p.read_bytes()).hexdigest());print(hashlib.sha256(p.read_bytes()).hexdigest())
