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
  ADD COLUMN IF NOT EXISTS provider_reference text;
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
END $$;
COMMIT;
