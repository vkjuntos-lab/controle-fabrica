-- Adicionar Cost Center em tabelas existentes se não houver
ALTER TABLE public.accounts_payable ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id);
ALTER TABLE public.accounts_receivable ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id);
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id);

-- Configuração de Gateways de Pagamento (Mercado Pago, PIX etc)
CREATE TABLE IF NOT EXISTS public.payment_gateways (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name text NOT NULL,
    provider text NOT NULL, -- 'mercado_pago', 'pagseguro', 'pix_gateway'
    credentials jsonb NOT NULL DEFAULT '{}',
    active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_gateways TO authenticated;
GRANT ALL ON public.payment_gateways TO service_role;
ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'payment_gateways' AND policyname = 'Users can manage their store gateways'
    ) THEN
        CREATE POLICY "Users can manage their store gateways" 
        ON public.payment_gateways FOR ALL TO authenticated 
        USING (public.has_role(auth.uid(), 'admin') OR store_id IN (SELECT store_id FROM public.user_roles WHERE user_id = auth.uid()));
    END IF;
END
$$;

-- Função para Fluxo de Caixa por Centro de Custo
CREATE OR REPLACE FUNCTION public.cashflow_by_cost_center(_store_id uuid, _from date, _to date)
RETURNS TABLE (
    cost_center_id uuid,
    cost_center_name text,
    kind text,
    monthly_budget numeric,
    realized_in numeric,
    realized_out numeric,
    forecast_in numeric,
    forecast_out numeric,
    net numeric
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cc.id as cost_center_id,
        cc.name as cost_center_name,
        cc.kind,
        cc.monthly_budget,
        COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'income'), 0) as realized_in,
        COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'expense'), 0) as realized_out,
        COALESCE(SUM(r.amount) FILTER (WHERE r.status = 'open'), 0) as forecast_in,
        COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'open'), 0) as forecast_out,
        COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'income'), 0) - COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'expense'), 0) as net
    FROM public.cost_centers cc
    LEFT JOIN public.financial_transactions t ON t.cost_center_id = cc.id AND t.paid_at::date BETWEEN _from AND _to
    LEFT JOIN public.accounts_receivable r ON r.cost_center_id = cc.id AND r.due_date BETWEEN _from AND _to
    LEFT JOIN public.accounts_payable p ON p.cost_center_id = cc.id AND p.due_date BETWEEN _from AND _to
    WHERE cc.store_id = _store_id
    GROUP BY cc.id, cc.name, cc.kind, cc.monthly_budget;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cashflow_by_cost_center FROM anon;
GRANT EXECUTE ON FUNCTION public.cashflow_by_cost_center TO authenticated;