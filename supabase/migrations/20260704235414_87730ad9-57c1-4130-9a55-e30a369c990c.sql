
-- DRE por categoria em um período
CREATE OR REPLACE FUNCTION public.dre_by_category(_store_id uuid, _from timestamptz, _to timestamptz)
RETURNS TABLE(category_id uuid, category_name text, kind fin_kind, total numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ft.category_id,
         COALESCE(fc.name, '(sem categoria)') AS category_name,
         ft.kind,
         sum(ft.amount)::numeric AS total
  FROM public.financial_transactions ft
  LEFT JOIN public.financial_categories fc ON fc.id = ft.category_id
  WHERE ft.store_id = _store_id
    AND ft.paid_at BETWEEN _from AND _to
    AND public.user_has_store(auth.uid(), _store_id)
  GROUP BY ft.category_id, fc.name, ft.kind
  ORDER BY ft.kind, total DESC;
$$;
GRANT EXECUTE ON FUNCTION public.dre_by_category(uuid, timestamptz, timestamptz) TO authenticated;

-- Curva ABC de fornecedores (contas a pagar já baixadas no período)
CREATE OR REPLACE FUNCTION public.abc_suppliers(_store_id uuid, _from timestamptz, _to timestamptz)
RETURNS TABLE(supplier text, total numeric, share numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT COALESCE(NULLIF(ap.supplier,''),'(sem fornecedor)') AS supplier,
           sum(COALESCE(ap.paid_amount, ap.amount)) AS total
    FROM public.accounts_payable ap
    WHERE ap.store_id = _store_id
      AND ap.status = 'paid'
      AND ap.paid_at BETWEEN _from AND _to
      AND public.user_has_store(auth.uid(), _store_id)
    GROUP BY 1
  ),
  tot AS (SELECT NULLIF(sum(total),0) AS t FROM base)
  SELECT b.supplier, b.total,
    CASE WHEN (SELECT t FROM tot) IS NULL THEN 0
         ELSE (b.total / (SELECT t FROM tot))::numeric
    END AS share
  FROM base b
  ORDER BY b.total DESC;
$$;
GRANT EXECUTE ON FUNCTION public.abc_suppliers(uuid, timestamptz, timestamptz) TO authenticated;

-- Auditoria automática de AP/AR
CREATE OR REPLACE FUNCTION public.audit_payable_receivable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _entity text := TG_TABLE_NAME;
  _sid uuid;
  _amt numeric;
  _rowid text;
  _action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _sid := NEW.store_id; _amt := NEW.amount; _rowid := NEW.id::text;
    _action := _entity || '.create';
  ELSIF TG_OP = 'UPDATE' THEN
    _sid := NEW.store_id; _amt := COALESCE(NEW.paid_amount, NEW.amount); _rowid := NEW.id::text;
    IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
      _action := _entity || '.paid';
    ELSE
      RETURN NEW; -- só audita criação e baixa
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    _sid := OLD.store_id; _amt := OLD.amount; _rowid := OLD.id::text;
    _action := _entity || '.delete';
  END IF;

  PERFORM public.log_audit(_action, _entity, _rowid, _sid,
    jsonb_build_object('amount', _amt));
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_audit_ap ON public.accounts_payable;
CREATE TRIGGER trg_audit_ap
AFTER INSERT OR UPDATE OR DELETE ON public.accounts_payable
FOR EACH ROW EXECUTE FUNCTION public.audit_payable_receivable();

DROP TRIGGER IF EXISTS trg_audit_ar ON public.accounts_receivable;
CREATE TRIGGER trg_audit_ar
AFTER INSERT OR UPDATE OR DELETE ON public.accounts_receivable
FOR EACH ROW EXECUTE FUNCTION public.audit_payable_receivable();
