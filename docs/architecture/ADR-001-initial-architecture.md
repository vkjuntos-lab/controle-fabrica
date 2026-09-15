# ADR-001 — Arquitetura inicial

- **Status:** aceito
- **Data:** 2026-09-15
- **Contexto do produto:** plataforma SaaS de gestão para uma fábrica (segmento inicial: dança),
  cobrindo matéria-prima → produção → estoque → distribuição → marketplaces/parceiros → venda →
  cobrança → recebimento → financeiro → inteligência.

## Stack encontrada no projeto

Verificada no repositório desta execução:

- TanStack Start v1 (rotas file-based em `src/routes`, `createServerFn`, `src/start.ts`)
- React 19 + TypeScript
- Vite 7
- Tailwind CSS v4 (tokens em `src/styles.css`, sem `tailwind.config.js`)
- shadcn/ui em `src/components/ui`
- Lovable Cloud (Supabase gerenciado): Postgres, Auth, Storage, integração gerada em
  `src/integrations/supabase/*`
- Deploy em runtime serverless de edge (Cloudflare Workers) via hospedagem Lovable

## Stack adotada

Mantida sem alteração. Não foram introduzidos Next.js, Prisma, outro ORM, outro banco ou outra
camada de autenticação. Motivo: a stack encontrada já atende os requisitos (SSR, server functions,
RLS, tipagem gerada) e manter a arquitetura nativa reduz complexidade no handoff para o Claude Code.

## Autenticação

- Supabase Auth (e-mail + senha habilitado nesta etapa).
- Sessão no navegador via cliente gerado (`@/integrations/supabase/client`).
- Rotas protegidas sob `src/routes/_authenticated/` com `ssr: false` e `beforeLoad` que chama
  `supabase.auth.getUser()` e redireciona para `/auth`.
- Server functions sensíveis usam `requireSupabaseAuth`; o bearer é anexado pelo
  `functionMiddleware` registrado em `src/start.ts`.
- Recuperação de senha: `resetPasswordForEmail` → rota pública `/reset-password`.

## Banco de dados

Postgres (Lovable Cloud). Tabelas criadas nesta fundação:

| Tabela | Papel |
| --- | --- |
| `organizations` | tenant raiz (empresa) |
| `profiles` | dados do usuário (1:1 com `auth.users`, criado por trigger) |
| `organization_members` | vínculo usuário ↔ organização + papel + ativo |
| `role_permissions` | matriz papel → permissão (fonte de verdade da autorização) |
| `audit_log` | registro de ações relevantes |

Funções `SECURITY DEFINER`: `is_org_member`, `has_org_role`, `has_permission`, `my_organizations`.
Triggers: `handle_new_user` (cria perfil), `handle_new_organization` (criador entra como admin),
`set_updated_at`.

## Tenancy

`organization_id` é o escopo principal. `store_id` **não** é tenant. Locais, canais, lojas de
marketplace e parceiros serão filhos da organização, adicionados nas próximas etapas.

## RLS

Habilitado em todas as tabelas públicas, com `GRANT` explícito por papel do PostgREST.
As políticas usam as funções `SECURITY DEFINER` acima para evitar recursão. `audit_log` é somente
leitura para admin/gestor (escrita apenas por caminhos autenticados de servidor).

## Routing

File-based (`src/routes`). Públicas: `/`, `/auth`, `/reset-password`.
Protegidas: `/dashboard`, `/onboarding`, `/perfil`, `/admin/organizacao`, `/admin/usuarios`,
`/admin/permissoes`.

## Server functions

`createServerFn` em `src/lib/org/organizations.functions.ts`. Operações de escrita (criar/editar
organização, alterar papel, remover participante, adicionar participante) acontecem no servidor,
com RLS aplicada como o usuário. O client `service_role` é carregado dentro do handler apenas para
localizar a conta por e-mail, após checagem de papel via `has_org_role`.

Webhooks e cron ainda **não existem** neste repositório; quando existirem, ficarão em
`src/routes/api/public/*` com validação de assinatura/segredo, idempotência e logs.

## Secrets

Nenhum segredo no código. Variáveis de servidor lidas com `process.env` dentro dos handlers;
variáveis públicas via `import.meta.env.VITE_*`.

## Limitações conhecidas

- Convite por e-mail não implementado: só é possível adicionar quem já tem conta.
- Matriz de permissões é somente leitura na interface (editada por migração).
- Nenhum módulo operacional (produtos, estoque, produção, marketplaces, parceiros, financeiro)
  implementado — apenas a fundação.
- Sem webhooks, cron, storage de arquivos ou importação de planilhas nesta etapa.
- Inventory ledger definido conceitualmente em `docs/business/CORE-BUSINESS.md`, ainda não modelado.

## Avisos aceitos do linter de banco

Quatro avisos de "SECURITY DEFINER executável por usuários logados" permanecem, referentes a
`is_org_member`, `has_org_role`, `has_permission` e `my_organizations`. A execução por usuários
logados é necessária: essas funções são avaliadas dentro das políticas de RLS e pelas server
functions. A execução por visitantes não autenticados (`anon`) e por `PUBLIC` foi revogada, e as
funções de gatilho não são mais executáveis por usuários logados.
