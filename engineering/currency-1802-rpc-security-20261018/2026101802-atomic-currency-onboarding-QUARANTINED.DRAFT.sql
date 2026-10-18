-- ISO source snapshot SHA256 33139b438657d1cee116ba737807ea71d19d6de4b90f799a09c56f0cc6a1b0ff
-- LOCAL REVIEW DRAFT ONLY. Not a release migration or activation request.
-- Depends on accepted create_org_with_store TABLE(uuid,uuid,uuid), the existing
-- accounting authority, and set_org_timezone_once. Never creates another ledger.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
CREATE TABLE backend_core.currency_onboarding_requests (
 actor_id uuid NOT NULL REFERENCES auth.users(id), request_id uuid NOT NULL,
 fingerprint jsonb NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 PRIMARY KEY(actor_id,request_id)
);
ALTER TABLE backend_core.currency_onboarding_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE backend_core.currency_onboarding_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON backend_core.currency_onboarding_requests FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.create_org_with_store_currency_v1(p_request_id uuid,p_org_name text,p_first_store_name text,
 p_currency text DEFAULT 'TZS',p_timezone text DEFAULT 'Africa/Dar_es_Salaam',p_acknowledged boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=backend_core.active_subject(); previous backend_core.currency_onboarding_requests%ROWTYPE;
 fingerprint jsonb; org_id uuid; store_id uuid; membership_id uuid; confirmation jsonb; result jsonb;
BEGIN
 IF actor IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';END IF;
 IF p_org_name IS NULL OR p_first_store_name IS NULL OR length(btrim(p_org_name)) NOT BETWEEN 1 AND 200 OR length(btrim(p_first_store_name)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'INVALID_ORGANIZATION_INPUT';END IF;
 IF p_acknowledged IS DISTINCT FROM true OR p_currency IS NULL OR NOT EXISTS(SELECT 1 FROM proforma_backend.currency_catalog c JOIN (VALUES ('AED',2),('AFN',2),('ALL',2),('AMD',2),('AOA',2),('ARS',2),('AUD',2),('AWG',2),('AZN',2),('BAM',2),('BBD',2),('BDT',2),('BHD',3),('BIF',0),('BMD',2),('BND',2),('BOB',2),('BRL',2),('BSD',2),('BTN',2),('BWP',2),('BYN',2),('BZD',2),('CAD',2),('CDF',2),('CHF',2),('CLP',0),('CNY',2),('COP',2),('CRC',2),('CUP',2),('CVE',2),('CZK',2),('DJF',0),('DKK',2),('DOP',2),('DZD',2),('EGP',2),('ERN',2),('ETB',2),('EUR',2),('FJD',2),('FKP',2),('GBP',2),('GEL',2),('GHS',2),('GIP',2),('GMD',2),('GNF',0),('GTQ',2),('GYD',2),('HKD',2),('HNL',2),('HTG',2),('HUF',2),('IDR',2),('ILS',2),('INR',2),('IQD',3),('IRR',2),('ISK',0),('JMD',2),('JOD',3),('JPY',0),('KES',2),('KGS',2),('KHR',2),('KMF',0),('KPW',2),('KRW',0),('KWD',3),('KYD',2),('KZT',2),('LAK',2),('LBP',2),('LKR',2),('LRD',2),('LSL',2),('LYD',3),('MAD',2),('MDL',2),('MGA',2),('MKD',2),('MMK',2),('MNT',2),('MOP',2),('MRU',2),('MUR',2),('MVR',2),('MWK',2),('MXN',2),('MYR',2),('MZN',2),('NAD',2),('NGN',2),('NIO',2),('NOK',2),('NPR',2),('NZD',2),('OMR',3),('PAB',2),('PEN',2),('PGK',2),('PHP',2),('PKR',2),('PLN',2),('PYG',0),('QAR',2),('RON',2),('RSD',2),('RUB',2),('RWF',0),('SAR',2),('SBD',2),('SCR',2),('SDG',2),('SEK',2),('SGD',2),('SHP',2),('SLE',2),('SOS',2),('SRD',2),('SSP',2),('STN',2),('SYP',2),('SZL',2),('THB',2),('TJS',2),('TMT',2),('TND',3),('TOP',2),('TRY',2),('TTD',2),('TWD',2),('TZS',2),('UAH',2),('UGX',0),('USD',2),('UYU',2),('UZS',2),('VES',2),('VND',0),('VUV',0),('WST',2),('XAF',0),('XCD',2),('XCG',2),('XOF',0),('XPF',0),('YER',2),('ZAR',2),('ZMW',2),('ZWG',2)) iso(code,units) ON iso.code=c.code AND iso.units=c.minor_units WHERE c.code=p_currency) THEN RAISE EXCEPTION 'CURRENCY_ACKNOWLEDGEMENT_REQUIRED';END IF;
 IF p_timezone IS NULL OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p_timezone) THEN RAISE EXCEPTION 'INVALID_TIMEZONE';END IF;
 fingerprint:=jsonb_build_array(btrim(p_org_name),btrim(p_first_store_name),p_currency,p_timezone,p_acknowledged);
 PERFORM pg_advisory_xact_lock(hashtextextended('currency-onboarding:'||actor::text,0));
 SELECT * INTO previous FROM backend_core.currency_onboarding_requests q WHERE q.actor_id=actor AND q.request_id=p_request_id;
 IF FOUND THEN
  IF previous.fingerprint<>fingerprint THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.org_memberships m JOIN public.organizations o ON o.id=m.organization_id AND o.is_active IS TRUE JOIN proforma_backend.accounting_currency ac ON ac.organization_id=o.id AND ac.currency=previous.result->>'currency' WHERE m.organization_id=(previous.result->>'organizationId')::uuid AND m.user_id=actor AND lower(m.role)='owner' AND m.is_active IS TRUE) THEN RAISE EXCEPTION 'OWNER_REQUIRED';END IF;
  RETURN previous.result;
 END IF;
 SELECT c.organization_id,c.store_id,c.membership_id INTO STRICT org_id,store_id,membership_id FROM public.create_org_with_store(btrim(p_org_name),btrim(p_first_store_name)) c;
 IF org_id IS NULL OR store_id IS NULL OR membership_id IS NULL THEN RAISE EXCEPTION 'INVALID_ONBOARDING_RESULT';END IF;
 confirmation:=public.owner_confirm_org_accounting_currency_v1(org_id,p_request_id,p_currency,'CONFIRM','NEW_ORGANIZATION',true,NULL);
 IF confirmation->>'status' IS DISTINCT FROM 'CONFIRMED' OR confirmation->>'currency' IS DISTINCT FROM p_currency THEN RAISE EXCEPTION 'CURRENCY_CONFIRMATION_FAILED';END IF;
 PERFORM public.set_org_timezone_once(org_id,p_timezone);
 -- The canonical table has a default timezone, so set-once may legitimately
 -- return false. This row was created above inside this transaction only.
 UPDATE public.organizations SET timezone=p_timezone WHERE id=org_id AND created_by=actor;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=org_id AND timezone=p_timezone) THEN RAISE EXCEPTION 'TIMEZONE_CONFIRMATION_FAILED';END IF;
 result:=jsonb_build_object('organizationId',org_id,'storeId',store_id,'membershipId',membership_id,'currency',p_currency,'status','CONFIRMED','postingActivated',false);
 INSERT INTO backend_core.currency_onboarding_requests(actor_id,request_id,fingerprint,result) VALUES(actor,p_request_id,fingerprint,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean) FROM PUBLIC,anon,service_role;
-- Quarantined until separately authorized backend activation. Frontend flags are not security.
REVOKE ALL ON FUNCTION public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean) FROM authenticated;
DO $quarantine$
DECLARE f oid:='public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean)'::regprocedure; g record;
BEGIN
 -- Remove grants introduced by owner-specific default ACLs, including inherited roles.
 FOR g IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid=f AND a.grantee<>p.proowner AND a.grantee<>0 LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.create_org_with_store_currency_v1(uuid,text,text,text,text,boolean) FROM %I',pg_get_userbyid(g.grantee));
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles r WHERE NOT r.rolsuper AND r.oid<>(SELECT proowner FROM pg_proc WHERE oid=f) AND (has_function_privilege(r.oid,f,'EXECUTE') OR pg_has_role(r.oid,(SELECT proowner FROM pg_proc WHERE oid=f),'MEMBER'))) THEN
  RAISE EXCEPTION 'ONBOARDING_QUARANTINE_EFFECTIVE_EXECUTE';
 END IF;
END $quarantine$;
-- No change to original RPC, existing currency rows, financial values or grants.
COMMIT;
