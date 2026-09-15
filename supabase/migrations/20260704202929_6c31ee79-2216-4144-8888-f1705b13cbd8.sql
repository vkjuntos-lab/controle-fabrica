
CREATE TABLE public.cashier_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  operator TEXT NOT NULL,
  opening NUMERIC NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  closing_counted JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.cashier_sessions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cashier_sessions TO authenticated;
GRANT ALL ON public.cashier_sessions TO service_role;
ALTER TABLE public.cashier_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions readable by everyone" ON public.cashier_sessions FOR SELECT USING (true);
CREATE POLICY "sessions insertable by anyone" ON public.cashier_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "sessions updatable by anyone" ON public.cashier_sessions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "sessions deletable by authenticated" ON public.cashier_sessions FOR DELETE TO authenticated USING (true);
CREATE TRIGGER cashier_sessions_set_updated_at BEFORE UPDATE ON public.cashier_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX cashier_sessions_open_idx ON public.cashier_sessions(closed_at) WHERE closed_at IS NULL;

ALTER TABLE public.sales ADD COLUMN session_id UUID REFERENCES public.cashier_sessions(id) ON DELETE SET NULL;
CREATE INDEX sales_session_id_idx ON public.sales(session_id);
