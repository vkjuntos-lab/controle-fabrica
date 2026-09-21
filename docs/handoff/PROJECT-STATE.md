# Estado do projeto — handoff contínuo

Última atualização: LOVABLE MASTER 003 — Inventory Ledger (estoque por movimentos imutáveis) sobre o MASTER 002 (Catálogo de Produtos) e a fundação do MASTER 001. Etapa atual: integração das telas com as RPCs, migration complementar `20260923100000_inventory_workflows.sql` e testes PostgreSQL reproduzíveis. Validação local; publicação não verificada.

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
- Domínio Catálogo Mestre de Produtos (LOVABLE MASTER 002):
  - Tabelas `products` (o MODELO), `product_variants` (unidade comercial: SKU, código de barras,
    tamanho, cor, custo, preço de venda, peso) e `product_categories` (hierárquica via
    `parent_id`); enums `product_status`/`product_variant_status`
    (ACTIVE, INACTIVE, DISCONTINUED, DRAFT); coluna `attributes` jsonb para campos futuros;
    tenant `organization_id` em tudo.
  - RLS: leitura por qualquer membro (`is_org_member`); escrita por quem tem a permissão
    `products.manage` (`has_permission`). Exclusão física bloqueada quando há variantes ou
    categoria em uso — o caminho padrão para tirar de linha é o status DISCONTINUED.
  - Permissões seedadas: `products.read` (todos os papéis) e `products.manage`
    (admin, gestor, estoque).
  - Server functions em `src/lib/products/products.functions.ts`: CRUD de produtos, categorias e
    variantes com checagem de permissão server-side e escrita de `audit_log`
    (`product.*`, `category.*`, `variant.*`).
  - Telas `/produtos` (listagem com busca, filtro por status, paginação, criar/editar produto,
    ativar/inativar/descontinuar/excluir) e `/produtos/$id` (detalhe do produto e gestão completa
    de variantes). Item "Produtos" no menu de Operação do `AppShell`.
- Domínio Estoque — Inventory Ledger (LOVABLE MASTER 003):
  - O saldo **nunca** é um campo: é derivado dos movimentos. Tabelas `inventory_locations`,
    `inventory_movements` (ledger imutável), `inventory_batches`, `inventory_transfers` +
    `inventory_transfer_items`, `inventory_counts` + `inventory_count_items` e
    `organization_inventory_settings`; enums de tipo/direção/status de movimento, tipo/status de
    localização, status de transferência/contagem/lote. Tenant `organization_id` em tudo.
  - View `inventory_balances` (`security_invoker = on`) e RPC `inventory_get_balance` derivam o
    saldo por variante + localização + lote.
  - Semântica de saldo: somente `POSTED` soma. O status legado `REVERSED` não é mais gravado
    (migrado para `POSTED`); correção gera compensação `REVERSAL` (POSTED, direção oposta) e o
    original permanece `POSTED` — o par soma zero. `PENDING`/`CANCELED` nunca somam. `quantity` é
    sempre positiva e `direction` (IN/OUT) decide o sinal. Reversões também respeitam o bloqueio de saldo
    negativo; `_allow_negative_override` é sempre recusado.
  - Operações transacionais: `inventory_post_movement` (valida saldo, advisory lock por
    organização, idempotência por `UNIQUE(organization_id, idempotency_key)`, recusa tipos
    dedicados), `inventory_post_transfer` (par OUT+IN atômico; `TRANSFER`, `PARTNER_SHIPMENT` e
    `PARTNER_RETURN`), `inventory_reverse_movement` (compensa por inteiro — inclusive transferências —
    com `REVERSAL`, original permanece `POSTED`) e `inventory_complete_count` (snapshot por lote,
    aplica divergências como ajustes e bloqueia a localização durante a contagem).
  - Integridade transacional (migration `20260921100000_inventory_integrity.sql`): `batch_id` e
    `inventory_count_item_key` (NULLS NOT DISTINCT) em itens de contagem, `inventory_one_reversal`
    (uma compensação por movimento), `inventory_one_open_count` (uma contagem aberta por localização),
    `inventory_lock` (trava por organização), saldo derivado exclusivamente dos movimentos e guard de tenant
    (`inventory_guard_relations`). Verificação reproduzível em `scripts/test-inventory-db.py`; a alegação anterior de 80 testes sem arquivo reproduzível foi substituída pelos cenários documentados.
  - Estoque negativo bloqueado por padrão; liberável por organização
    (`organization_inventory_settings.allow_negative_inventory`). Remessa a parceiro não é venda
    (não gera receita/AR). Movimentos nunca são editados/excluídos — correção por reversão.
  - Permissões seedadas: `inventory.read`, `inventory.movements.read`, `inventory.move`,
    `inventory.adjust`, `inventory.transfer`, `inventory.count`, `inventory.opening_balance`,
    `inventory.reverse`, `inventory.manage_locations` (admin/gestor/estoque com todas; demais papéis
    com leitura). Módulo "Estoque" passou de `coming_soon` para `available` em `src/lib/rbac.ts`.
  - Server functions em `src/lib/inventory/inventory.functions.ts`; lógica pura do ledger em
    `src/lib/inventory/ledger.ts` (`ledger.ts` + testes) e labels/opções em
    `src/lib/inventory/constants.ts`. Tipos manuais atualizados em `src/integrations/supabase/types.ts`.
  - Telas: `/estoque` (posição, alerta de mínimo, exportação), `/estoque/movimentacoes` (+ `/$id`
    com reversão), `/estoque/transferencias`, `/estoque/locations`, `/estoque/terceiros` e
    `/estoque/inventarios` (+ `/$id`). Itens no menu de Operação do `AppShell`; dialog reutilizável
    de movimento e de transferência/remessa.
- Documentação: ADR-001 (cron/webhook/storage), CORE-BUSINESS, INVENTORY (novo), este handoff.

- Complemento MASTER 003: posição paginada/agregada no banco, busca barcode, categorias/status,
  agrupamentos, dashboard quantitativo, CSV de todas as páginas da posição, contagem por lote
  via RPC, leitura barcode textual, cartões mobile, filtros de movimentos por variante/usuário/status,
  inventários paginados com responsável/divergências. Transferência preserva lote e confere payload
  de retries. Auditoria de localização/configuração transacional e antes/depois das postagens.
- Negativo exige configuração + `inventory.allow_negative`; referências de contagem são reservadas
  à RPC privada. Harness PostgreSQL testa RLS, permissões, atomicidade, lotes, concorrência real,
  estorno, contagem e mais de mil SKUs.

## NOT_IMPLEMENTED

- Módulos/telas completos: Comercial, Produção (migration preparatória preexistente preservada), Marketplaces, Parceiros, Financeiro, Relatórios,
  Inteligência (marcados como `coming_soon` em `src/lib/rbac.ts`, fora do menu operacional).
- Valorização financeira do estoque (custo/valor por movimento) — o ledger registra quantidades.
- Integração automática de venda/produção/compra com o ledger (hoje os lançamentos são feitos
  pelas telas de estoque; os módulos de origem ainda não existem).
- Atributos personalizados editáveis na tela (o campo `attributes` jsonb já existe nas tabelas
  de produto/variante).
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
- Estoque é um ledger imutável: o saldo é sempre derivado dos movimentos, nunca armazenado em
  coluna. Nada é editado ou excluído; correções/estornos são movimentos novos (reversão).
- Tipos de movimento que exigem par (transferência, remessa/retorno de parceiro, reversão) só
  podem ser criados pelas RPCs dedicadas, nunca direto por `inventory_post_movement`.

## KNOWN_LIMITATIONS

- Nova migration validada localmente, não aplicada ao Lovable Cloud nesta execução. Falta smoke
  test autenticado publicado. Ver relatório `docs/handoff/MASTER-003-VALIDATION.md`.
- Replay limpo da migration histórica `20260918100000_inventory_ledger.sql` precisa carregar esse
  arquivo com `check_function_bodies=off` por erro legado de alvo record; o harness isola e documenta
  esse passo. Migrations publicadas foram preservadas.
- Barcode via teclado/leitor físico; câmera não implementada. CSV de posição completo; CSV de
  movimentos exporta a página indicada. XLSX/importação inicial não implementados.
- Contagem bloqueia localização até conclusão/cancelamento. Lock por organização prioriza
  integridade sobre paralelismo. Sem reservas/valorização financeira.


- Envio automático de e-mail de convite: não existe — o link é copiado e compartilhado
  manualmente (WhatsApp, e-mail externo, etc.). Um provedor de e-mail transacional seria
  necessário para envio automático.
- Confirmação de e-mail está ativa: após criar conta é necessário clicar no link recebido.
- Nenhum segredo de integração externa configurado (requer definir `LOVABLE_CRON_SECRET`,
  `WEBHOOK_SECRET` e service role no Lovable Cloud para ativar cron/webhook/auditoria de sistema).
- Erros de lint pré-existentes em arquivos fora do escopo desta fundação (439 erros de
  formatação em arquivos não editados nesta fase) — não introduzidos por esta sessão.

## NEXT_STEPS

1. Ligar venda, recebimento de compra e produção ao ledger (movimentos automáticos `SALE`,
   `PURCHASE_RECEIPT`, `PRODUCTION_OUTPUT`/`PRODUCTION_CONSUMPTION`).
2. Valorização do estoque (custo por movimento, CMV) e relatórios de quantidade + valor.
3. Marketplaces/lojas e importação com mapeamento configurável de colunas.
4. Reconciliação de parceiros, fechamento de período e cobrança (server-side, auditado).
5. Definir `LOVABLE_CRON_SECRET`/`WEBHOOK_SECRET` e ligar um provedor real a
   `/api/webhooks/receiver` quando houver integração externa.

## VALIDAÇÃO DESTA CONTINUAÇÃO

Relatório completo: `docs/handoff/MASTER-003-VALIDATION.md`.
30 testes unitários, harness PostgreSQL (9 grupos), TypeScript, build e lint do domínio verificados.
A implantação no banco publicado não faz parte da evidência local e permanece pendente.
