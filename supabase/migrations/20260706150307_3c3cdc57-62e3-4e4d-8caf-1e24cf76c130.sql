
DO $$ BEGIN
  CREATE TYPE public.fiscal_doc_kind AS ENUM ('nfce', 'nfe', 'cfe_sat', 'nfe_devolucao');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.fiscal_doc_status AS ENUM ('pending', 'processing', 'authorized', 'rejected', 'cancelled', 'contingency', 'inutilized');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.fiscal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  kind fiscal_doc_kind NOT NULL,
  serie int NOT NULL,
  numero int NOT NULL,
  chave text,
  status fiscal_doc_status NOT NULL DEFAULT 'pending',
  environment fiscal_environment NOT NULL DEFAULT 'homologacao',
  protocolo text,
  xml_authorized text,
  xml_cancelled text,
  qrcode_url text,
  danfe_url text,
  total_value numeric(14,2) NOT NULL DEFAULT 0,
  reference text,
  provider text NOT NULL DEFAULT 'focus',
  provider_ref text,
  error_msg text,
  retry_count int NOT NULL DEFAULT 0,
  emitted_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (serie, numero, kind, store_id)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_documents_status ON public.fiscal_documents(status);
CREATE INDEX IF NOT EXISTS idx_fiscal_documents_sale ON public.fiscal_documents(sale_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_documents_created ON public.fiscal_documents(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_documents TO authenticated;
GRANT ALL ON public.fiscal_documents TO service_role;
ALTER TABLE public.fiscal_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fiscal_documents authenticated all"
  ON public.fiscal_documents FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.fiscal_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.fiscal_documents(id) ON DELETE CASCADE,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_queue_next ON public.fiscal_queue(next_attempt_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_queue TO authenticated;
GRANT ALL ON public.fiscal_queue TO service_role;
ALTER TABLE public.fiscal_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fiscal_queue authenticated all"
  ON public.fiscal_queue FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_fiscal_documents_updated ON public.fiscal_documents;
CREATE TRIGGER trg_fiscal_documents_updated BEFORE UPDATE ON public.fiscal_documents
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_touch_updated_at();

DROP TRIGGER IF EXISTS trg_fiscal_queue_updated ON public.fiscal_queue;
CREATE TRIGGER trg_fiscal_queue_updated BEFORE UPDATE ON public.fiscal_queue
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_touch_updated_at();
