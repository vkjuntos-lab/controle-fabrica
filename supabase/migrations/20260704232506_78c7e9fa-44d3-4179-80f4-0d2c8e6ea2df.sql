
-- =========================================================
-- Sprint 3 — Financeiro (Onda A)
-- Categorias, Contas a Pagar/Receber, Transações + backfill
-- =========================================================

-- Enum de tipo de categoria
DO $$ BEGIN
  CREATE TYPE public.fin_kind AS ENUM ('income','expense');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.fin_status AS ENUM ('open','paid','overdue','canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.fin_source AS ENUM ('sale','pix','manual','payable','receivable','adjust');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------- financial_categories ----------------
CREATE TABLE IF NOT EXISTS public.financial_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind public.fin_kind NOT NULL,
  parent_id UUID REFERENCES public.financial_categories(id) ON DELETE SET NULL,
  color TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_categories TO authenticated;
GRANT ALL ON public.financial_categories TO service_role;

ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fincat_select" ON public.financial_categories
  FOR SELECT TO authenticated USING (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "fincat_insert" ON public.financial_categories
  FOR INSERT TO authenticated WITH CHECK (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "fincat_update" ON public.financial_categories
  FOR UPDATE TO authenticated USING (public.user_has_store(auth.uid(), store_id))
  WITH CHECK (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "fincat_delete" ON public.financial_categories
  FOR DELETE TO authenticated USING (public.user_has_store(auth.uid(), store_id));

CREATE INDEX IF NOT EXISTS idx_fincat_store ON public.financial_categories(store_id);

-- ---------------- bank_accounts ----------------
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  bank TEXT,
  agency TEXT,
  account_number TEXT,
  opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_cash BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank_select" ON public.bank_accounts
  FOR SELECT TO authenticated USING (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "bank_insert" ON public.bank_accounts
  FOR INSERT TO authenticated WITH CHECK (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "bank_update" ON public.bank_accounts
  FOR UPDATE TO authenticated USING (public.user_has_store(auth.uid(), store_id))
  WITH CHECK (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "bank_delete" ON public.bank_accounts
  FOR DELETE TO authenticated USING (public.user_has_store(auth.uid(), store_id));

CREATE INDEX IF NOT EXISTS idx_bank_store ON public.bank_accounts(store_id);

-- ---------------- accounts_payable ----------------
CREATE TABLE IF NOT EXISTS public.accounts_payable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  supplier TEXT,
  description TEXT NOT NULL,
  category_id UUID REFERENCES public.financial_categories(id) ON DELETE SET NULL,
  competence DATE,
  due_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  status public.fin_status NOT NULL DEFAULT 'open',
  planned_method TEXT,
  bank_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  paid_amount NUMERIC(12,2),
  attachment_url TEXT,
  recurring TEXT,          -- 'monthly' | 'weekly' | null
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts_payable TO authenticated;
GRANT ALL ON public.accounts_payable TO service_role;

ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ap_select" ON public.accounts_payable
  FOR SELECT TO authenticated USING (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "ap_insert" ON public.accounts_payable
  FOR INSERT TO authenticated WITH CHECK (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "ap_update" ON public.accounts_payable
  FOR UPDATE TO authenticated USING (public.user_has_store(auth.uid(), store_id))
  WITH CHECK (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "ap_delete" ON public.accounts_payable
  FOR DELETE TO authenticated USING (public.user_has_store(auth.uid(), store_id));

CREATE INDEX IF NOT EXISTS idx_ap_store_due ON public.accounts_payable(store_id, due_date);
CREATE INDEX IF NOT EXISTS idx_ap_status ON public.accounts_payable(status);

-- ---------------- accounts_receivable ----------------
CREATE TABLE IF NOT EXISTS public.accounts_receivable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  description TEXT NOT NULL,
  category_id UUID REFERENCES public.financial_categories(id) ON DELETE SET NULL,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  competence DATE,
  due_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  status public.fin_status NOT NULL DEFAULT 'open',
  planned_method TEXT,
  bank_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  paid_amount NUMERIC(12,2),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts_receivable TO authenticated;
GRANT ALL ON public.accounts_receivable TO service_role;

ALTER TABLE public.accounts_receivable ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ar_select" ON public.accounts_receivable
  FOR SELECT TO authenticated USING (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "ar_insert" ON public.accounts_receivable
  FOR INSERT TO authenticated WITH CHECK (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "ar_update" ON public.accounts_receivable
  FOR UPDATE TO authenticated USING (public.user_has_store(auth.uid(), store_id))
  WITH CHECK (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "ar_delete" ON public.accounts_receivable
  FOR DELETE TO authenticated USING (public.user_has_store(auth.uid(), store_id));

CREATE INDEX IF NOT EXISTS idx_ar_store_due ON public.accounts_receivable(store_id, due_date);
CREATE INDEX IF NOT EXISTS idx_ar_status ON public.accounts_receivable(status);
CREATE INDEX IF NOT EXISTS idx_ar_sale ON public.accounts_receivable(sale_id);

-- ---------------- financial_transactions (livro-razão) ----------------
CREATE TABLE IF NOT EXISTS public.financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  kind public.fin_kind NOT NULL,
  source public.fin_source NOT NULL DEFAULT 'manual',
  description TEXT,
  amount NUMERIC(12,2) NOT NULL,           -- sempre positivo; kind define sinal
  payment_method TEXT,
  category_id UUID REFERENCES public.financial_categories(id) ON DELETE SET NULL,
  bank_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  payable_id UUID REFERENCES public.accounts_payable(id) ON DELETE SET NULL,
  receivable_id UUID REFERENCES public.accounts_receivable(id) ON DELETE SET NULL,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  pix_charge_id UUID REFERENCES public.pix_charges(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_transactions TO authenticated;
GRANT ALL ON public.financial_transactions TO service_role;

ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ft_select" ON public.financial_transactions
  FOR SELECT TO authenticated USING (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "ft_insert" ON public.financial_transactions
  FOR INSERT TO authenticated WITH CHECK (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "ft_update" ON public.financial_transactions
  FOR UPDATE TO authenticated USING (public.user_has_store(auth.uid(), store_id))
  WITH CHECK (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "ft_delete" ON public.financial_transactions
  FOR DELETE TO authenticated USING (public.user_has_store(auth.uid(), store_id));

CREATE INDEX IF NOT EXISTS idx_ft_store_paid ON public.financial_transactions(store_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_ft_source ON public.financial_transactions(source);

-- ---------------- triggers de updated_at ----------------
CREATE TRIGGER trg_fincat_updated BEFORE UPDATE ON public.financial_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_bank_updated BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_ap_updated BEFORE UPDATE ON public.accounts_payable
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_ar_updated BEFORE UPDATE ON public.accounts_receivable
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------- triggers de baixa: AP/AR pagos geram transação ----------------
CREATE OR REPLACE FUNCTION public.on_payable_paid()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    INSERT INTO public.financial_transactions (
      store_id, kind, source, description, amount, payment_method,
      category_id, bank_account_id, payable_id, paid_at, created_by
    ) VALUES (
      NEW.store_id, 'expense', 'payable',
      COALESCE(NEW.description, 'Baixa a pagar'),
      COALESCE(NEW.paid_amount, NEW.amount),
      NEW.planned_method, NEW.category_id, NEW.bank_account_id,
      NEW.id, COALESCE(NEW.paid_at, now()), NEW.created_by
    );
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_payable_paid AFTER UPDATE ON public.accounts_payable
  FOR EACH ROW EXECUTE FUNCTION public.on_payable_paid();

CREATE OR REPLACE FUNCTION public.on_receivable_paid()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    INSERT INTO public.financial_transactions (
      store_id, kind, source, description, amount, payment_method,
      category_id, bank_account_id, receivable_id, sale_id, paid_at, created_by
    ) VALUES (
      NEW.store_id, 'income', 'receivable',
      COALESCE(NEW.description, 'Recebimento'),
      COALESCE(NEW.paid_amount, NEW.amount),
      NEW.planned_method, NEW.category_id, NEW.bank_account_id,
      NEW.id, NEW.sale_id, COALESCE(NEW.paid_at, now()), NEW.created_by
    );
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_receivable_paid AFTER UPDATE ON public.accounts_receivable
  FOR EACH ROW EXECUTE FUNCTION public.on_receivable_paid();

-- ---------------- Backfill: vendas existentes viram transações (income/sale) ----------------
INSERT INTO public.financial_transactions (
  store_id, kind, source, description, amount, payment_method, sale_id, paid_at, created_at
)
SELECT
  s.store_id,
  'income'::public.fin_kind,
  'sale'::public.fin_source,
  'Venda ' || s.code,
  s.total,
  NULL,
  s.id,
  s.created_at,
  s.created_at
FROM public.sales s
WHERE s.store_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.financial_transactions ft
    WHERE ft.sale_id = s.id AND ft.source = 'sale'
  );

-- ---------------- Categorias padrão por loja ----------------
INSERT INTO public.financial_categories (store_id, name, kind, color)
SELECT s.id, x.name, x.kind::public.fin_kind, x.color
FROM public.stores s
CROSS JOIN (VALUES
  ('Vendas', 'income', '#10b981'),
  ('Serviços', 'income', '#06b6d4'),
  ('Outros recebimentos', 'income', '#84cc16'),
  ('Aluguel', 'expense', '#ef4444'),
  ('Fornecedores', 'expense', '#f97316'),
  ('Salários', 'expense', '#a855f7'),
  ('Marketing', 'expense', '#ec4899'),
  ('Impostos', 'expense', '#eab308'),
  ('Utilidades', 'expense', '#3b82f6'),
  ('Outras despesas', 'expense', '#64748b')
) AS x(name, kind, color)
WHERE NOT EXISTS (
  SELECT 1 FROM public.financial_categories fc
  WHERE fc.store_id = s.id AND fc.name = x.name
);
