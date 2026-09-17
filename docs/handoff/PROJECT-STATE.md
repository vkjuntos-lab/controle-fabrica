# Estado do projeto — handoff contínuo

Última atualização: fundação (LOVABLE MASTER 001) + camada de plataforma (cron, webhook, storage).

## IMPLEMENTED

- Stack TanStack Start + React 19 + TypeScript + Vite + Tailwind v4 + Lovable Cloud (Supabase).
- Design system em `src/styles.css` (tokens de cor, raio, sombras, tipografia Space Grotesk/DM Sans).
- Banco recriado do zero com o schema de fundação: `organizations`, `profiles`,
  `organization_members`, `role_permissions`, `audit_log`.
- Enum `app_role`: admin, gestor, financeiro, estoque, producao, comercial, marketplace.
- RLS habilitada em todas as tabelas, com `GRANT` explícito e funções `SECURITY DEFINER`
  (`is_org_member`, `has_org_role`, `has_permission`, `my_organizations`).
- Triggers: criação de perfil no cadastro, criador da organização como admin, `updated_at`.
- Autenticação Supabase: entrar, criar conta, sair, recuperar senha (`/reset-password`), sessão.
- Rotas protegidas via layout `_authenticated` (`ssr: false` + `beforeLoad`).
- Server functions com `requireSupabaseAuth`, escrita em `audit_log` e checagem explícita
  de permissão (`has_permission`) server-side nas operações que exigem papel sensível
  (`src/lib/org/organizations.functions.ts`).
- Contexto de organização no client (`src/lib/org/org-context.tsx`) com troca de organização e
  `hasPermission`.
- RBAC centralizado em `src/lib/rbac.ts` (papéis, permissões, módulos e status de cada módulo).
- Layout principal: `AppShell` com sidebar, header, seletor de organização e menu do usuário.
- Estados padrão: Loading, Empty, Error, Permission Denied, Coming Soon
  (`src/components/states/index.tsx`).
- Telas: landing pública, `/auth`, `/reset-password`, `/dashboard`, `/onboarding`, `/perfil`,
  `/admin/organizacao`, `/admin/usuarios`, `/admin/permissoes`, `/admin/auditoria`.
- Auditoria consultável: `listAuditLogs`/`listAuditActions` (server-side, exige `audit.read`) e tela
  `/admin/auditoria` com busca, filtro por ação e paginação.
- Cron autenticado: `GET /api/cron/health` (`src/routes/api/cron.health.ts`) usando
  `authenticateCronRequest` (header `Authorization: Bearer $LOVABLE_CRON_SECRET`), rate limit
  `cron:health` e escrita de `audit_log`.
- Webhook receptor genérico: `POST /api/webhooks/receiver` (`src/routes/api/webhooks.receiver.ts`)
  com assinatura HMAC-SHA256 (`x-webhook-signature`, segredo `WEBHOOK_SECRET`), idempotência via
  tabela `webhook_events` (unique `provider + event_id`), rate limit por provider, limite de payload
  e respostas HTTP explícitas (401/413/429/503). Desabilitado por padrão (sem `WEBHOOK_SECRET`).
- Storage de avatares: bucket `avatars` (leitura pública, escrita restrita à própria pasta do
  usuário, limite 1,5MB, jpeg/png/webp) + upload no perfil (`/perfil`) com pré-visualização,
  validação de formato/tamanho no client e server functions `setMyAvatar`/`removeMyAvatar`.
- Documentação: ADR-001, CORE-BUSINESS, este handoff.

## PARTIAL

- Administração > Usuários: adiciona apenas pessoas que já possuem conta (sem convite por e-mail).
- Administração > Permissões: matriz visível somente para leitura; alteração via migração.
- Dashboard: apenas estados vazios explicativos — nenhum indicador calculado (não há movimentações).
- Responsividade: layout adapta-se a tablet/celular; fluxos móveis específicos (scanner, aprovação)
  não iniciados.

## NOT_IMPLEMENTED

- Módulos: Comercial, Produtos, Estoque, Produção, Marketplaces, Parceiros, Financeiro, Relatórios,
  Inteligência (marcados como `coming_soon` em `src/lib/rbac.ts`, fora do menu operacional).
- Inventory Ledger (modelo de movimentos de estoque).
- Product/Variant, atributos personalizados, códigos de barras.
- Importação CSV/XLSX com mapeamento configurável de colunas e `external_sku`.
- Reconciliação de parceiros, fechamento de período, geração de cobrança, registro de pagamento.
- Webhooks (`src/routes/api/public/*`), cron/automações, filas.
- Integrações de marketplace por API, pagamentos, e-mail transacional, notificações.
- Modo DEMO.

## DECISIONS

- Tenant é `organization_id`; `store_id` não é tenant.
- Autorização derivada de `role_permissions` no banco; nenhuma checagem por e-mail no código.
- Nada de funcionalidade falsa: o que não existe aparece como "em breve" ou não aparece.
- Regras financeiras/fiscais não são inventadas; o código as recebe depois.
- Referência de engenharia: KS MultiMake (padrões), nunca o domínio de negócio dele.

## KNOWN_LIMITATIONS

- Convite por e-mail depende de provedor de e-mail transacional ainda não configurado.
- Confirmação de e-mail está ativa: após criar conta é necessário clicar no link recebido.
- Sem testes automatizados nesta etapa.
- Nenhum segredo de integração externa configurado.

## NEXT_STEPS

1. Modelar Product → Variant com SKU/código de barras e atributos extensíveis.
2. Modelar o Inventory Ledger (movimentos + visões de saldo) como fonte única do estoque.
3. Modelar locais de estoque e posse de terceiros (parceiro).
4. Marketplaces/lojas e importação com mapeamento configurável de colunas.
5. Reconciliação, fechamento de período e cobrança (server-side, auditado).
6. Financeiro e relatórios de quantidade + valor.
