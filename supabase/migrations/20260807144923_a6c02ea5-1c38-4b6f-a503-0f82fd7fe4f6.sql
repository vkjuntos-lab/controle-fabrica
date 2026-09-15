-- Tabela social_accounts
CREATE TABLE public.social_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform TEXT NOT NULL CHECK (platform IN ('INSTAGRAM', 'FACEBOOK')),
    account_id TEXT NOT NULL,
    name TEXT,
    access_token TEXT NOT NULL,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (store_id, platform, account_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_accounts TO authenticated;
GRANT ALL ON public.social_accounts TO service_role;

ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage social accounts for their stores"
ON public.social_accounts
FOR ALL
TO authenticated
USING (public.user_has_store(auth.uid(), store_id))
WITH CHECK (public.user_has_store(auth.uid(), store_id));

-- Tabela post_drafts
CREATE TABLE public.post_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caption TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'FAILED', 'SCHEDULED')),
    platform TEXT NOT NULL CHECK (platform IN ('INSTAGRAM', 'FACEBOOK', 'BOTH')),
    media_type TEXT NOT NULL CHECK (media_type IN ('SINGLE', 'CAROUSEL', 'VIDEO')),
    media_urls JSONB DEFAULT '[]'::jsonb,
    ai_prompt TEXT,
    visual_style TEXT,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    published_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_drafts TO authenticated;
GRANT ALL ON public.post_drafts TO service_role;

ALTER TABLE public.post_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage post drafts for their stores"
ON public.post_drafts
FOR ALL
TO authenticated
USING (public.user_has_store(auth.uid(), store_id))
WITH CHECK (public.user_has_store(auth.uid(), store_id));
