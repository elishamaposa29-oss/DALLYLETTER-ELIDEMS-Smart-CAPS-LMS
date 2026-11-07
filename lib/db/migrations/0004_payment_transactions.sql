-- Durable checkout ledger for PayPal, Paynow and verified manual receipts.
-- Safe to apply repeatedly and independently of the API process.
BEGIN;
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS amount_paid numeric(10,2) NOT NULL DEFAULT 0;
UPDATE public.payments
SET amount_paid = amount
WHERE lower(status) = 'paid' AND COALESCE(amount_paid, 0) = 0;
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id bigserial PRIMARY KEY,
  payment_id integer NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  provider text NOT NULL,
  reference text NOT NULL UNIQUE,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending',
  provider_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS provider_reference text,
  ADD COLUMN IF NOT EXISTS provider_order_id text,
  ADD COLUMN IF NOT EXISTS provider_capture_id text,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD';
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_provider_order_unique
  ON public.payment_transactions(provider,provider_order_id)
  WHERE provider_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_provider_capture_unique
  ON public.payment_transactions(provider,provider_capture_id)
  WHERE provider_capture_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.payment_provider_webhook_audit (
  id bigserial PRIMARY KEY,
  provider text NOT NULL,
  event_id text,
  transmission_id text,
  event_type text,
  order_id text,
  capture_id text,
  signature_verified boolean NOT NULL DEFAULT false,
  outcome text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_provider_webhook_audit_created_idx
  ON public.payment_provider_webhook_audit(provider,created_at DESC);
CREATE INDEX IF NOT EXISTS payment_provider_webhook_audit_event_idx
  ON public.payment_provider_webhook_audit(provider,event_id);
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_manual_receipt_unique
  ON public.payment_transactions(payment_id, provider, provider_reference)
  WHERE provider LIKE 'manual:%' AND provider_reference IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_manual_receipt_global_unique
  ON public.payment_transactions(provider, provider_reference)
  WHERE provider LIKE 'manual:%' AND provider_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_transactions_payment_status_idx
  ON public.payment_transactions(payment_id, status);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='payment_transactions' AND column_name='provider_reference'
  ) THEN
    RAISE EXCEPTION 'payment_transactions.provider_reference migration verification failed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='payment_transactions'
      AND indexname='payment_transactions_manual_receipt_global_unique'
  ) THEN
    RAISE EXCEPTION 'payment transaction manual receipt uniqueness index missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='payment_transactions' AND column_name='provider_order_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='payment_transactions' AND column_name='provider_capture_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='payment_transactions' AND column_name='currency'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='payment_provider_webhook_audit'
  ) THEN
    RAISE EXCEPTION 'PayPal order/capture audit schema verification failed';
  END IF;
END $$;
COMMIT;
