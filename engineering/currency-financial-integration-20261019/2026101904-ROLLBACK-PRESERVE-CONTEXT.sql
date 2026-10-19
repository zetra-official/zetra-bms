-- LOCAL DRAFT rollback. Use only with explicit authorization and bounded locks.
-- Retain currency_context columns and every captured value; never drop/backfill them.
BEGIN;
SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='30s';
DROP TRIGGER IF EXISTS financial_currency_context_v1 ON public.sales;
DROP TRIGGER IF EXISTS financial_currency_context_v1 ON public.sale_payments;
DROP TRIGGER IF EXISTS financial_currency_context_v1 ON public.expenses;
-- Keep quarantined helper for evidence; no EXECUTE grant or native activation.
COMMIT;
