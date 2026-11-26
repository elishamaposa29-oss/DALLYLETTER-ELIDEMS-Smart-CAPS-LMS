BEGIN;

-- Reconcile the denormalized payments.amount_paid balance with the immutable
-- settled transaction ledger. Existing paid balances predating the transaction
-- ledger are represented as opening-balance transactions, never discarded.
CREATE TABLE IF NOT EXISTS public.payment_ledger_reconciliation_audit (
  id bigserial PRIMARY KEY,
  payment_id integer NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  recorded_amount_paid numeric(10,2) NOT NULL,
  settled_transaction_total numeric(10,2) NOT NULL,
  delta numeric(10,2) NOT NULL,
  action text NOT NULL CHECK (action IN ('preserve_legacy_opening_balance', 'restore_transaction_ledger_total')),
  reconciled_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, recorded_amount_paid, settled_transaction_total, action)
);

WITH totals AS (
  SELECT
    p.id,
    ROUND(COALESCE(p.amount_paid, 0)::numeric, 2) AS recorded_amount_paid,
    ROUND(COALESCE(SUM(t.amount) FILTER (WHERE t.status = 'paid'), 0)::numeric, 2) AS settled_transaction_total
  FROM public.payments p
  LEFT JOIN public.payment_transactions t ON t.payment_id = p.id
  GROUP BY p.id, p.amount_paid
)
INSERT INTO public.payment_ledger_reconciliation_audit
  (payment_id, recorded_amount_paid, settled_transaction_total, delta, action)
SELECT
  id,
  recorded_amount_paid,
  settled_transaction_total,
  ABS(recorded_amount_paid - settled_transaction_total),
  CASE
    WHEN recorded_amount_paid > settled_transaction_total THEN 'preserve_legacy_opening_balance'
    ELSE 'restore_transaction_ledger_total'
  END
FROM totals
WHERE recorded_amount_paid <> settled_transaction_total
ON CONFLICT (payment_id, recorded_amount_paid, settled_transaction_total, action) DO NOTHING;

-- Preserve previously credited legacy/manual balances that have no transaction
-- row yet. This is an accounting opening balance, not a claim of a new payment.
WITH totals AS (
  SELECT
    p.id,
    ROUND(COALESCE(p.amount_paid, 0)::numeric, 2) AS recorded_amount_paid,
    ROUND(COALESCE(SUM(t.amount) FILTER (WHERE t.status = 'paid'), 0)::numeric, 2) AS settled_transaction_total
  FROM public.payments p
  LEFT JOIN public.payment_transactions t ON t.payment_id = p.id
  GROUP BY p.id, p.amount_paid
)
INSERT INTO public.payment_transactions
  (payment_id, provider, reference, amount, status, provider_reference, currency, created_at, updated_at)
SELECT
  id,
  'opening_balance',
  'DL-OPENING-' || id::text,
  (recorded_amount_paid - settled_transaction_total)::numeric(10,2),
  'paid',
  'legacy_amount_paid_before_transaction_ledger',
  'USD',
  now(),
  now()
FROM totals
WHERE recorded_amount_paid > settled_transaction_total
ON CONFLICT (reference) DO NOTHING;

-- If immutable settled transactions exceed the old summary column, the
-- transaction ledger wins. This repairs missed/delayed summary updates without
-- creating a second transaction or changing the original transaction history.
WITH totals AS (
  SELECT
    p.id,
    ROUND(COALESCE(SUM(t.amount) FILTER (WHERE t.status = 'paid'), 0)::numeric, 2) AS settled_transaction_total
  FROM public.payments p
  LEFT JOIN public.payment_transactions t ON t.payment_id = p.id
  GROUP BY p.id
)
UPDATE public.payments p
SET amount_paid = totals.settled_transaction_total,
    status = CASE
      WHEN totals.settled_transaction_total >= p.amount THEN 'paid'
      WHEN totals.settled_transaction_total > 0 THEN 'partially_paid'
      WHEN lower(COALESCE(p.status, '')) = 'overdue' THEN 'overdue'
      ELSE 'pending'
    END,
    updated_at = now()
FROM totals
WHERE p.id = totals.id
  AND ROUND(COALESCE(p.amount_paid, 0)::numeric, 2) <> totals.settled_transaction_total
  AND lower(COALESCE(p.status, '')) IN ('pending', 'overdue', 'partially_paid', 'paid');

-- Fail the migration if any eligible invoice still disagrees with its settled
-- transaction total. This also catches a conflicting pre-existing opening row.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.payments p
    LEFT JOIN public.payment_transactions t ON t.payment_id = p.id AND t.status = 'paid'
    WHERE lower(COALESCE(p.status, '')) IN ('pending', 'overdue', 'partially_paid', 'paid')
    GROUP BY p.id, p.amount_paid
    HAVING ROUND(COALESCE(p.amount_paid, 0)::numeric, 2) <> ROUND(COALESCE(SUM(t.amount), 0)::numeric, 2)
  ) THEN
    RAISE EXCEPTION 'Payment ledger reconciliation left one or more invoice balances inconsistent';
  END IF;
END $$;

COMMIT;
