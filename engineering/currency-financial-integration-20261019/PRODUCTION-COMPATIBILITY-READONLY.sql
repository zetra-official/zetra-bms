BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
SELECT jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',data_type,'nullable',is_nullable) ORDER BY table_name,ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('sales','sale_payments','expenses','stores')),
 'authorityColumns',(SELECT jsonb_agg(jsonb_build_object('column',column_name,'type',data_type) ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='proforma_backend' AND table_name='accounting_currency'),
 'functions',(SELECT jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,'definitionMd5',md5(replace(pg_get_functiondef(p.oid),chr(13),'')),'owner',pg_get_userbyid(p.proowner)) ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND ((n.nspname='public' AND p.proname IN ('create_sale_with_payment_v6','get_sale_detail','get_expenses_v2','create_expense_v2')) OR (n.nspname='backend_core' AND p.proname IN ('capture_financial_currency_v1','active_subject')))),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'definitionMd5',md5(pg_get_triggerdef(t.oid))) ORDER BY c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace='public'::regnamespace AND c.relname IN ('sales','sale_payments','expenses')),
 'rls',(SELECT jsonb_agg(jsonb_build_object('table',relname,'enabled',relrowsecurity,'forced',relforcerowsecurity) ORDER BY relname) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('sales','sale_payments','expenses'))
) metadata;
ROLLBACK;
