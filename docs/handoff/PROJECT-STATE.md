# Estado do projeto — handoff contínuo

Última atualização: LOVABLE MASTER 002 — Catálogo Mestre de Produtos (Product + Variant + Categorias) sobre a fundação completa do MASTER 001.

## IMPLEMENTED

- Stack TanStack Start + React 19 + TypeScript + Vite + Tailwind v4 + Lovable Cloud (Supabase).
- Design system em `src/styles.css` (tokens de cor, raio, sombras, tipografia Space Grotesk/DM Sans).
- Banco recriado do zero com o schema de fundação: `organizations`, `profiles`,
  `organization_members`, `role_permissions`, `audit_log`, `invitations`, `webhook_events`.
- Enum `app_role`: admin, gestor, financeiro, estoque, producao, comercial, marketplace.
- Enum `invitation_status`: pending, accepted, expired, revoked.
- RLS habilitada em todas as tabelas, com `GRANT` explícito e funções `SECURITY DEFINER`
  (`is_org_member`, `has_org_role`, `has_permission`, `my_organizations`).
- Triggers: criação de perfil no cadastro, criador da organização como admin, `updated_at`.
- Autenticação Supabase: entrar, criar conta, sair, recuperar senha (`/reset-password`), sessão,
  suporte a redirect pós-login (`/auth?redirect=...`).
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
  `/admin/organizacao`, `/admin/usuarios`, `/admin/permissoes`, `/admin/auditoria`, `/convidar`.
- Auditoria consultável: `listAuditLogs`/`listAuditActions` (server-side, exige `audit.read`) e tela
  `/admin/auditoria` com busca, filtro por ação e paginação.
- Convite por link: admin/gestor gera convite por e-mail + papel; o link
  (`/convidar?token=...`) leva a página pública onde a pessoa cria conta (ou entra com)
  com o e-mail convidado e aceita; o convite expira em 7 dias, pode ser revogado e é listado
  na tela `/admin/usuarios`. Envio automático de e-mail não existe — o link é copiado e
  compartilhado manualmente.
- Matriz de permissões editável: admin pode conceder/revogar permissões a cada papel via
  tela `/admin/permissoes` (toggle clique-a-ção). A edição usa server function `updateRolePermission`
  que valida `permissions.manage` e escreve via service role. Permissão `permissions.manage`
  concedida ao papel `admin` por migration.
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
- Testes automatizados (Vitest): 17 testes em 4 arquivos cobrindo assinatura HMAC (`signature`),
  rate-limit, conversão CSV (`toCsv`/`fromCsv`) e estrutura do RBAC (papéis, permissões,
  módulos).
- PWA manifest corrigido para a marca do projeto (`/`, nome "Estratégia", theme_color
  `#12213a`) — corrigido o resíduo do KS MultiMake.
- Documentação: ADR-001 (atualizado com cron/webhook/storage), CORE-BUSINESS, este handoff.

## NOT_IMPLEMENTED

- Módulos: Comercial, Produtos, Estoque, Produção, Marketplaces, Parceiros, Financeiro, Relatórios,
  Inteligência (marcados como `coming_soon` em `src/lib/rbac.ts`, fora do menu operacional).
- Inventory Ledger (modelo de movimentos de estoque).
- Product/Variant, atributos personalizados, códigos de barras.
- Importação CSV/XLSX com mapeamento configurável de colunas e `external_sku`.
- Reconciliação de parceiros, fechamento de período, geração de cobrança, registro de pagamento.
- Webhooks de domínio (`/api/webhooks/receiver` pronto, mas nenhum provedor externo conectado e
  sem `WEBHOOK_SECRET` definido em ambiente), cron/automações de negócio, filas.
- Integrações de marketplace por API, pagamentos, e-mail transacional, notificações.
- Modo DEMO.

## DECISIONS

- Tenant é `organization_id`; `store_id` não é tenant.
- Autorização derivada de `role_permissions` no banco; nenhuma checagem por e-mail no código.
- Nada de funcionalidade falsa: o que não existe aparece como "em breve" ou não aparece.
- Regras financeiras/fiscais não são inventadas; o código as recebe depois.
- Referência de engenharia: KS MultiMake (padrões), nunca o domínio de negócio dele.
- Webhooks e cron desabilitados por padrão: sem segredo configurado em ambiente, os endpoints
  respondem explicitamente em vez de fingir funcionar.
- Upload de avatar é client-side no bucket `avatars`; o servidor nunca recebe/carrega o arquivo,
  apenas grava a URL pública validando o caminho do usuário.
- Convite por link: o e-mail do convite vincula ao destino (só aceita quem está logado com
  aquele e-mail); o envio é manual (copiar link). O token (UUID v4) é o segredo de acesso;
  o serviço nunca envia e-mail; a página de aceite informa e orienta sem expor demais.
- Edição de permissões é global (role_permissions sem tenant) e pode ser feita por qualquer
  admin em qualquer organização; a server function valida que o chamador tem `permissions.manage`.

## KNOWN_LIMITATIONS

- Envio automático de e-mail de convite: não existe — o link é copiado e compartilhado
  manualmente (WhatsApp, e-mail externo, etc.). Um provedor de e-mail transacional seria
  necessário para envio automático.
- Confirmação de e-mail está ativa: após criar conta é necessário clicar no link recebido.
- Nenhum segredo de integração externa configurado (requer definir `LOVABLE_CRON_SECRET`,
  `WEBHOOK_SECRET` e service role no Lovable Cloud para ativar cron/webhook/auditoria de sistema).
- Erros de lint pré-existentes em arquivos fora do escopo desta fundação (439 erros de
  formatação em arquivos não editados nesta fase) — não introduzidos por esta sessão.

## NEXT_STEPS

1. Modelar Product → Variant com SKU/código de barras e atributos extensíveis.
2. Modelar o Inventory Ledger (movimentos + visões de saldo) como fonte única do estoque.
3. Modelar locais de estoque e posse de terceiros (parceiro).
4. Marketplaces/lojas e importação com mapeamento configurável de colunas.
5. Reconciliação, fechamento de período e cobrança (server-side, auditado).
6. Financeiro e relatórios de quantidade + valor.
7. Definir `LOVABLE_CRON_SECRET`/`WEBHOOK_SECRET` e ligar um provedor real a
   `/api/webhooks/receiver` quando houver integração externa.