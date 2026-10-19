BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT jsonb_build_object(
 'nonownerObjectGrants',(SELECT count(*) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.relnamespace='backend_core'::regnamespace AND c.relname LIKE 'tzs_onboarding_%' AND a.grantee<>c.relowner),
 'clientEffectivePrivileges',(SELECT count(*) FROM pg_class c CROSS JOIN pg_roles r WHERE c.relnamespace='backend_core'::regnamespace AND c.relname LIKE 'tzs_onboarding_%' AND r.rolname IN('anon','authenticated','service_role','authenticator') AND CASE WHEN c.relkind='S' THEN has_sequence_privilege(r.oid,c.oid,'USAGE,SELECT,UPDATE') ELSE has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') END),
 'sequenceCount',(SELECT count(*) FROM pg_class c WHERE c.relnamespace='backend_core'::regnamespace AND c.relname LIKE 'tzs_onboarding_%' AND c.relkind='S')
) metadata;
ROLLBACK;
