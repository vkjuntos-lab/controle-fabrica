# Estado do projeto — handoff contínuo

## Continuação validada — 24/09/2026

Parceiros/lojas: interface alinhada às permissões reais `reconciliation.*` e `marketplace.manage`.
Aba de lojas do Parceiro 360 com paginação e acesso negado explícito. Teste integrado aplica os schemas
existentes de parceiros, reconciliação e financeiro e comprova vínculo de loja isolado por organização,
remessa 100→80/20, devolução →85/15, idempotência e ausência de venda/cobrança/efeito financeiro automático.
35 testes unitários, 9 grupos SQL de parceiros e 2 grupos de integração passaram, assim como
TypeScript, build e lint dos arquivos alterados. Detalhes em `MASTER-006-VALIDATION.md`.
Nenhuma migration foi alterada nesta continuação. O MASTER 007 e o código financeiro preexistentes
foram preservados. MarketplaceStore já existe; a pendência MASTER 005 é o importador automático.
Publicação e smoke test autenticado continuam sem verificação.


Última atualização: LOVABLE MASTER 007 — Marketplaces/lojas, vendas, mapeamento de SKU, regra
comercial (tabelas de preço) e reconciliação com fechamento idempotente de parceiros, sobre o
MASTER 006 (parceiros), MASTER 003 (Inventory Ledger), MASTER 002 (Catálogo) e a fundação do
MASTER 001. O MASTER 005 (importador marketplace automático) não está no checkout — o registro de
vendas é manual com o mesmo contrato. Etapa atual: reconciliação validada localmente
(`20260926100000_partner_reconciliation.sql`, telas, RBAC e testes PostgreSQL reproduzíveis).
Validação local; publicação não verificada.

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
- Domínio Parceiros (LOVABLE MASTER 006):
  - Tabelas `companies`, `company_roles` (papéis simultâneos PARTNER/CUSTOMER/SUPPLIER/RESELLER),
    `company_contacts`, `company_addresses`, `partner_profiles`, `partner_shipments` +
    `partner_shipment_items` e `partner_returns` + `partner_return_items`. Tenant em tudo.
  - Documentos normalizados (CPF/CNPJ/OTHER) com validação de formato server-side (RPC + Zod);
    código único por organização; contatos com um principal ativo; endereços com um principal por tipo.
  - `partner_save_company` cria, na mesma transação, perfil PARTNER e localização PARTNER vinculada
    por `inventory_locations.partner_id`; `partner_create_operation` cria remessa/devolução;
    `partner_shipment_action` avança a máquina de estados; `partner_receive_return` recebe devolução.
  - Remessa não é venda: SHIPPED transfere origem → parceiro via o mesmo núcleo privado
    `inventory_transfer_internal` usado por `inventory_post_transfer`; DELIVERED só confirma. Estoque
    do parceiro é derivado do ledger; nenhuma tabela de saldo. Devolução não altera a remessa
    histórica; SELLABLE volta ao normal, DAMAGED/DEFECTIVE/OTHER exigem QUARANTINE/INSPECTION.
  - Picking com scan (nome/SKU/barcode), expedição exige tudo separado, retry idempotente
    (`transfer_id` + chave `partner-shipment:<id>`), entrega sem segunda postagem, lock por
    organização. Romaneio autenticado; bucket privado `partner-documents` preparado (upload real pendente).
  - Permissões: `partners.read/create/update/block`, `partner_contacts.manage`,
    `partner_addresses.manage`, `partner_shipments.read/create/approve/pick/ship/receive/cancel`,
    `partner_returns.read/create/receive`, `partner_inventory.read/adjust`; admin/gestor/estoque com
    operação completa, demais papéis com leitura. RPCs SECURITY DEFINER validam tenant e permissão;
    núcleo do ledger permanece privado. Auditoria em toda transição/expedição/devolução.
  - Telas: `/parceiros` (empresas, busca, dashboard), `/parceiros/empresas/$id` (Parceiro 360:
    dados, contatos, endereços, remessas, estoque, devoluções e histórico paginado),
    `/parceiros/estoque` (posição atual/histórica com CSV), `/parceiros/remessas` (+ `/$id`) e
    `/parceiros/devolucoes` (+ `/$id`). Itens no menu Operação do `AppShell`. Rotas de detalhe de
    estoque ganharam Outlet para habilitar o Parceiro 360.
  - Regras: remessa não gera receita/AR, quantidade enviada ≠ vendida, posse física não muda
    titularidade, limites/condições de pagamento/reconciliação ficam para extensão futura.
- Domínio Reconciliação de Parceiros (LOVABLE MASTER 007):
  - Marketplace sem importador automático: `marketplace_stores` (FACTORY/OWN/PARTNER, `partner_id`
    quando PARTNER), `marketplace_imports`/`marketplace_import_rows` (contrato de importação),
    `marketplace_sales` (gross/discount/fee/shipping, dedup por `external_event_id`/`import_key`,
    nunca toca estoque), `external_sku_mappings` (por loja ou global com backfill).
  - Regra comercial: `price_tables`/`price_table_items`/`partner_price_links`; `rec_resolve_price`
    usa o preço vigente na data da venda; sem tabela, usa o líquido do marketplace (`rec_sale_net`).
    O gross é referência; o cobrável do parceiro segue a regra comercial.
  - Reconciliar ≠ vender de novo: `partner_reconciliations` (período por parceiro + frequência,
    snapshot, `closed_at`), `partner_reconciliation_items` (uma venda = um item; `posted` com baixa
    única e idempotente `rec-item:<id>` no ledger), `reconciliation_exceptions` (severidade/
    status/resolução), `partner_reconciliation_adjustments` (crédito/débito com motivo),
    `domain_events` (público `PARTNER_RECONCILIATION_CLOSED`).
  - Fluxo: preview `rec_preview`, `rec_create`, `rec_process`/`rec_process_item`/
    `rec_reprocess_item`, `rec_exception_resolve`, `rec_adjustment`, `rec_close` (idempotente,
    concorrente termina em um único `CLOSED`), `rec_reopen` (motivado), `rec_cancel`,
    `rec_reverse_item` (estorno com compensação IN), `rec_query` (dashboard/posição).
  - Closado é imutável; venda tardia vira `LATE_SALE_AFTER_CLOSING`; correção exige reabrir.
    Exceção resolve com suprimento real, nunca fabrica saldo; stock insuficiente bloqueia fechar.
  - Permissões: `partner_reconciliation.read/create/process/review/resolve_exception/close/reopen/
    reverse` e `partner_pricing.read/manage`; RPCs SECURITY DEFINER validam tenant e permissão;
    escritas diretas bloqueadas por RLS; auditoria em todo o ciclo.
  - Telas: `/reconciliacao` (dashboard), `/reconciliacao/periodos` (+ `/$id` com abas
    Itens/Exceções/Ajustes/Consolidado), `/reconciliacao/vendas`, `/reconciliacao/excecoes`,
    `/reconciliacao/tabelas-preco` (+ `/$id`), `/reconciliacao/lojas`, `/reconciliacao/mapeamento`;
    item "Reconciliação parcerias" no menu Operação. Parceiro 360 ganhou abas Marketplaces/Vendas/
    Reconciliações/Fechamentos.
- Documentação: ADR-001/ADR-006/ADR-007, CORE-BUSINESS, INVENTORY, PARTNERS, PARTNER-SHIPMENTS,
  PARTNER-RECONCILIATION, PARTNER-PRICING, este handoff.

- Complemento MASTER 003: posição paginada/agregada no banco, busca barcode, categorias/status,
  agrupamentos, dashboard quantitativo, CSV de todas as páginas da posição, contagem por lote
  via RPC, leitura barcode textual, cartões mobile, filtros de movimentos por variante/usuário/status,
  inventários paginados com responsável/divergências. Transferência preserva lote e confere payload
  de retries. Auditoria de localização/configuração transacional e antes/depois das postagens.
- Negativo exige configuração + `inventory.allow_negative`; referências de contagem são reservadas
  à RPC privada. Harness PostgreSQL testa RLS, permissões, atomicidade, lotes, concorrência real,
  estorno, contagem e mais de mil SKUs.

## NOT_IMPLEMENTED

- Módulos/telas completos: Comercial, Produção (migration preparatória `20260922100000_production.sql`
  preservada), Marketplaces, Financeiro, Relatórios, Inteligência (marcados como `coming_soon` em
  `src/lib/rbac.ts`, fora do menu operacional).
- MASTER 005 (MarketplaceStore, lojas vinculadas a parceiros, importação de relatórios e mapeamento
  de SKU) não está neste checkout; o vínculo parceiro → loja será feito quando o módulo existir, sem
  duplicar lojas nem baixar estoque por MarketplaceSale. O registro de vendas é manual com o mesmo
  contrato; a importação automática de provedores reais é pendência.
- Valorização financeira do estoque (custo/valor por movimento) — o ledger registra quantidades.
- Integração automática de venda/produção/compra com o ledger (hoje os lançamentos são feitos
  pelas telas de estoque; os módulos de origem ainda não existem).
- Atributos personalizados editáveis na tela (o campo `attributes` jsonb já existe nas tabelas
  de produto/variante).
- Importação CSV/XLSX com mapeamento configurável de colunas e `external_sku`.
- Cobrança/registro de pagamento do parceiro: o fechamento gera snapshot + `PARTNER_RECONCILIATION_
  CLOSED`, mas financeiro (AR), limites de crédito e condições de pagamento ficam para o próximo
  domínio.
- Upload/lista de anexos de remessa em `partner-documents` (preparação de Storage pronta), QR Code
  de remessa, editor de itens de documento consolidado e central de exceções de inventário.
- Recebimento parcial/trânsito em duas etapas de remessa (DELIVERED é pontual).
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
- Remessa não é venda e não gera receita/AR; o estoque do parceiro é derivado do ledger, sem tabela
  de saldo. Quantidade enviada ≠ vendida; posse física não muda a titularidade.
- Remessa/devolução recebida é imutável e o estorno genérico do par de movimentos vinculado é
  bloqueado; correção física exige novo documento (ou ajuste autorizado com motivo), nunca
  reinterpretação de fatos históricos.
- Vínculo parceiro → loja só será criado quando o MASTER 005 existir, com FK composta e
  organization_id; nada de tabela substituta de loja nesta fase.
- Remessa não é venda e reconciliar não vende de novo: a baixa oficial nasce do item reconciliado
  (`rec-item:<id>`, no máximo uma por venda); o gross do marketplace é referência e o cobrável
  segue a regra comercial vigente na data da venda.
- Período fechado é histórico imutável (snapshot + evento); correção pós-fechamento exige
  reabertura com motivo, nunca reinterpretação de fatos.

## KNOWN_LIMITATIONS

- Nova migration validada localmente, não aplicada ao Lovable Cloud nesta execução. Falta smoke
  test autenticado publicado. Ver relatórios `docs/handoff/MASTER-003-VALIDATION.md`,
  `docs/handoff/MASTER-006-VALIDATION.md` e `docs/handoff/MASTER-007-VALIDATION.md`.
- O harness PostgreSQL roda como usuário não root (`initdb` recusa root); reproduzir via
  `su - claude-runner` conforme documentado no relatório do MASTER 006.
- Replay limpo da migration histórica `20260918100000_inventory_ledger.sql` precisa carregar esse
  arquivo com `check_function_bodies=off` por erro legado de alvo record; o harness isola e documenta
  esse passo. Migrations publicadas foram preservadas.
- Barcode via teclado/leitor físico; câmera não implementada. CSV de posição completo; CSV de
  movimentos exporta a página indicada. XLSX/importação inicial não implementados.
- Contagem bloqueia localização até conclusão/cancelamento. Lock por organização prioriza
  integridade sobre paralelismo. Sem reservas/valorização financeira.
- O checkout não contém o MASTER 005 (MarketplaceStore); o vínculo parceiro → loja é uma pendência
  explícita e nenhuma funcionalidade falsa de marketplace foi declarada. Vendas são registradas
  manualmente no mesmo contrato de um importador; provedores reais ficam para o MASTER 005.

- Envio automático de e-mail de convite: não existe — o link é copiado e compartilhado
  manualmente (WhatsApp, e-mail externo, etc.). Um provedor de e-mail transacional seria
  necessário para envio automático.
- Confirmação de e-mail está ativa: após criar conta é necessário clicar no link recebido.
- Nenhum segredo de integração externa configurado (requer definir `LOVABLE_CRON_SECRET`,
  `WEBHOOK_SECRET` e service role no Lovable Cloud para ativar cron/webhook/auditoria de sistema).
- Erros de lint pré-existentes em arquivos fora do escopo desta fundação (439 erros de
  formatação em arquivos não editados nesta fase) — não introduzidos por esta sessão.

## NEXT_STEPS

1. Implementar/validar o importador MASTER 005 com o contrato de `marketplace_stores`, vínculo
   PARTNER → `partner_profiles` e `marketplace_sales` já existentes. Não duplicar o cadastro de lojas.
2. Financeiro de parceiros: consumir o snapshot/evento `PARTNER_RECONCILIATION_CLOSED` para gerar
   cobrança (AR) e registrar pagamento; limites de crédito e condições de pagamento.
3. Ligar venda, recebimento de compra e produção ao ledger (movimentos automáticos `SALE`,
   `PURCHASE_RECEIPT`, `PRODUCTION_OUTPUT`/`PRODUCTION_CONSUMPTION`).
4. Valorização do estoque (custo por movimento, CMV) e relatórios de quantidade + valor.
5. Definir `LOVABLE_CRON_SECRET`/`WEBHOOK_SECRET` e ligar um provedor real a
   `/api/webhooks/receiver` quando houver integração externa.

## VALIDAÇÃO DESTA CONTINUAÇÃO

Relatórios: `docs/handoff/MASTER-003-VALIDATION.md`, `docs/handoff/MASTER-006-VALIDATION.md` e
`docs/handoff/MASTER-007-VALIDATION.md`.
33 testes unitários, harness PostgreSQL do estoque, de parceiros e de reconciliação (12 grupos no
MASTER 007), TypeScript, build e lint do domínio verificados. A implantação no banco publicado não
faz parte da evidência local e permanece pendente.
