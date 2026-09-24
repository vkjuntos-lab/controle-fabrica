# MASTER 006 — Entrega e validação local

## Continuação de 24/09/2026 — estado atual

O registro original abaixo descreve o checkout de 22/09. Agora o projeto já contém
MarketplaceStore, reconciliação MASTER 007 e schema financeiro. Essas implementações foram
preservadas. A pendência MASTER 005 é o importador automático; o vínculo de loja já existe.

### Implementado e alterado

- Verificações da interface alinhadas a `reconciliation.*`, como concedido pelo banco.
- Cadastro de lojas, mapeamento de SKU e vendas externas exigem `marketplace.manage`, como suas RPCs.
- Aba de lojas do Parceiro 360 com paginação e estado de acesso negado.
- Teste de contrato impede divergência entre permissões do cliente e da migration do servidor.
- Teste integrado de loja/remessa/devolução, com o schema financeiro instalado, disponível em
  `npm run test:partners:integration` (`scripts/test-partner-store-integration-db.py`).

Arquivos alterados: `src/components/partners/pages.tsx`,
`src/components/reconciliation/{pages,marketplace}.tsx`, `src/lib/rbac.ts`,
`src/lib/rbac.test.ts`, `package.json` e documentação. O script integrado foi criado na continuação
anterior e validado novamente nesta. Nenhuma migration, tabela, RPC ou rota foi criada/alterada
nesta continuação. A migration e as entidades do MASTER 006 estão inventariadas abaixo.

### Integração, RLS, auditoria e testes

Reutilizadas migrations de parceiros, reconciliação e financeiro existentes. MarketplaceStore
PARTNER referencia PartnerProfile dentro da organização. Usuário de outro tenant não consulta
nem associa indevidamente a loja. Não houve alteração no mecanismo de auditoria ou nas regras
financeiras/reconciliação. Permissões do cliente agora correspondem às verificações server-side.

Resultados desta execução:

- `npm run test`: **35 testes passaram**.
- `npm run test:partners:db`: **9 grupos PostgreSQL passaram**, incluindo concorrência real.
- `npm run test:partners:integration`: **2 grupos passaram** com lojas e financeiro presentes.
- `npm run typecheck`, `npm run build` e ESLint dos arquivos alterados: **passaram**.
- `git diff --check`: sem erros.

A integração prova 100→80/20 na remessa e 85/15 após devolver 5. Repetir confirmação não duplica
movimento; a remessa continua registrando 20 enviados. Permanecem **zero** vendas externas,
contas a receber, transações financeiras e reconciliações geradas pelas operações de mercadoria.

### Limitações, pendências e próximo domínio

Publicação e smoke test autenticado não foram executados. Importador automático MASTER 005
continua pendente; deve usar o cadastro/contrato existente, sem duplicar lojas. Anexos continuam
com preparação de Storage, sem interface de upload. Preservar os módulos MASTER 007/financeiro
já presentes; esta continuação não adicionou lógica financeira nem reconciliou vendas.

## Registro da entrega original

Data: 22/09/2026. Continuação do projeto existente sobre a fundação, catálogo e Inventory Ledger;
sem recriar nada do MASTER 001/002/003. Nenhuma migration publicada foi alterada; nenhum push/deploy
foi feito. Este checkout não contém o MASTER 005 (MarketplaceStore/lojas) — a integração com lojas
fica registrada como pendência e não é declarada como pronta.

## IMPLEMENTADO

- **Company e relações comerciais**: `companies` com código único por organização, razão social,
  nome fantasia, documento (CPF/CNPJ/OTHER normalizados e validados por formato), inscrição estadual,
  contatos, endereços e papéis simultâneos PARTNER/CUSTOMER/SUPPLIER/RESELLER.
- **PartnerProfile**: perfil operacional criado automaticamente ao acrescentar PARTNER, com
  localização PARTNER vinculada (`inventory_locations.partner_id`) e frequência de fechamento
  (cadastral; não executa fechamento).
- **Remessa é transferência direta** origem → parceiro em SHIPPED, sem trânsito intermediário;
  DELIVERED só confirma recebimento (sem repetir movimento). Estoque do parceiro é derivado do
  Inventory Ledger; nenhuma tabela de saldo de parceiro.
- **Picking com scan** (nome/SKU/barcode, leitor físico ou manual), quantidades separadas entre
  zero e solicitado; expedição exige todos os itens separados.
- **Devoluções**: SELLABLE/DAMAGED/DEFECTIVE/OTHER com motivo obrigatório; SELLABLE volta à
  localização normal, demais condições exigem QUARANTINE/INSPECTION; limitadas ao enviado menos
  devoluções recebidas quando vinculadas à remessa.
- **Núcleo único do ledger**: corpo da transferência extraído para `inventory_transfer_internal`
  (privada); `inventory_post_transfer` e o fluxo de parceiro são wrappers que aplicam permissões e
  estados antes do mesmo escritor/guard/lock por organização.
- **Imutabilidade**: remessa/devolução recebida não é editada nem excluída; estorno genérico do par
  de movimentos vinculado é bloqueado; correção exige novo documento ou ajuste autorizado.
- **Romaneio autenticado** da remessa (não é nota fiscal) e preparação de Storage para anexos
  (bucket privado `partner-documents`, limitar upload a 10 MB PDF/JPEG/PNG no fluxo real).
- **Auditoria** completa: cadastro/bloqueio, contatos, endereços, transições de remessa, picking,
  expedição com `transfer_id`/movements, entrega, cancelamento e devolução.
- **RBAC/RLS**: permissões `partners.*`, `partner_contacts.*`, `partner_addresses.*`,
  `partner_shipments.*`, `partner_returns.*`, `partner_inventory.*`; RPCs SECURITY DEFINER validam
  organização e permissão; núcleo do ledger permanece privado.

## ALTERADO

`src/lib/partners/partners.functions.ts`, `src/lib/partners/types.ts`, `src/lib/partners/export.ts`,
`src/lib/inventory/inventory.functions.ts` (campo `partner_id` e vínculos), `src/lib/rbac.ts` e
`src/lib/rbac.test.ts`, `src/components/layout/app-shell.tsx`, telas de estoque existentes
(`/estoque/locations`, `movimentacoes`, `inventarios` — correção de encaixe das rotas filhas de
detalhe com Outlet), `src/integrations/supabase/types.ts`, `src/routeTree.gen.ts`,
`scripts/test-inventory-db.py`, `scripts/test-partners-db.py` (novo), `package.json`
(script `test:partners:db`).

## ARQUIVOS CRIADOS

- `supabase/migrations/20260924100000_partners.sql`
- `scripts/test-partners-db.py`
- `src/components/partners/company-form.tsx`, `operation-form.tsx`, `pages.tsx`, `reports.tsx`
- Rotas `src/routes/_authenticated/parceiros/`: `index`, `empresas.$id`, `estoque`, `remessas`,
  `remessas_.$id`, `devolucoes`, `devolucoes_.$id`
- `docs/business/PARTNERS.md`, `docs/business/PARTNER-SHIPMENTS.md`,
  `docs/architecture/ADR-006-PARTNER-SHIPMENTS.md`, `docs/handoff/MASTER-006-VALIDATION.md`

## MIGRATIONS E TABELAS

Migration nova: `20260924100000_partners.sql` (posterior às migrations preparatórias de
produção existentes). Tabelas novas: `companies`, `company_roles`, `company_contacts`,
`company_addresses`, `partner_profiles`, `partner_shipments`, `partner_shipment_items`,
`partner_returns`, `partner_return_items`. FKs relevadas para o ledger existente
(`inventory_locations`, `inventory_transfers`, `inventory_movements`, `products`, `product_variants`,
`inventory_batches`). Nenhuma tabela concorrente de saldo; FK `inventory_locations.partner_id`
adicionada como NOT VALID para preservar legados.

## FUNCTIONS / RPCs

Novas: `partner_require`, `partner_guard`, `partner_location_guard`, `partner_adjustment_guard`,
`partner_audit`, `partner_document_allowed` (política de anexos), `partner_save_company`,
`partner_save_detail`, `partner_create_operation`, `partner_shipment_action`,
`partner_receive_return`, `partner_query`.

Refatoradas: `inventory_transfer_internal` (privada, corpo da transferência) e
`inventory_post_transfer` (wrapper público que encaminha as localizações vinculadas ao fluxo de
remessa/devolução). Reutilizadas do estoque: `inventory_lock`, `inventory_get_balance`,
`inventory_post_movement_internal`, view `inventory_balances`.

## ROTAS

`/parceiros`, `/parceiros/empresas/$id`, `/parceiros/estoque`, `/parceiros/remessas`,
`/parceiros/remessas/$id`, `/parceiros/devolucoes`, `/parceiros/devolucoes/$id`. Ajustes nas rotas
de estoque existentes para dar Outlet aos detalhes (`/estoque/movimentacoes/$id`,
`/estoque/inventarios/$id`), preservando URLs e habilitando o Parceiro 360.

## PERMISSÕES E RLS

`partners.read/create/update/block`, `partner_contacts.manage`, `partner_addresses.manage`,
`partner_shipments.read/create/approve/pick/ship/receive/cancel`, `partner_returns.read/create/receive`,
`partner_inventory.read/adjust`. Defaults: admin/gestor/estoque com operação completa;
comercial/financeiro/marketplace/producao com leitura. Authenticated não tem escrita direta nas nove
tabelas; RPCs SECURITY DEFINER validam `auth.uid()`, organização, referências e permissão específica.
Triggers bloqueiam exclusão/edição de fatos consolidados. RLS exercitada em teste com duas
organizações (isolamento por tenant e lista acessível).

## TESTES

- `bun run test`: 30 testes unitários passaram (12 do ledger, 5 do RBAC atualizados).
- `bun run test:partners:db`: PostgreSQL local temporário, nove grupos de verificação passaram:
  remessa simples com retry e entrega sem segunda postagem (não é venda); devoluções parciais
  múltiplas com quantidade enviada imutável e limite por devolução; rollback por insuficiência,
  máquina de estados e bloqueio de estorno genérico de remessa expedida; concorrência real de
  expedições (só uma transação vence); isolamento RLS entre organizações e parceiro bloqueado;
  devoluções de defeito em quarentena, contatos/endereços, posições e dashboard; permissões
  server-side, núcleo privado negado e ajuste de parceiro exigindo permissão dedicada;
  multi-parceiro 200→120/50/30 e remessa 100 com devoluções 10+15 preservando os 100 enviados;
  normalização/formato de documento e relatórios por item.
- `bun run test:inventory:db`: regressão completa do estoque passou com a nova migration aplicada
  (nove grupos).
- `bun run typecheck`: TypeScript verificado.
- `bun run build`: compilação de produção verificada.
- `git diff --check`: sem erros de whitespace.

Cenário de aceite: saldo inicial de 100 unidades, remessa de 20 → 80 na origem e 20 no parceiro; o
estoque nunca fica fora do ledger; a expedição é idempotente no retry; entregar não repete o
movimento; devoluções recebidas preservam a quantidade enviada original da remessa. Os testes rodaram
como usuário não root (`initdb` recusa root); para reproduzir: `su - claude-runner -c "cd '<raiz-do-projeto>' && python3 scripts/test-partners-db.py"`.

## LIMITAÇÕES E PENDÊNCIAS

- Banco publicado não foi alterado nesta sessão. Aplicar `20260924100000_partners.sql` pelo fluxo do
  projeto e executar smoke test autenticado no Lovable Cloud permanece pendente; entrega validada
  localmente.
- **MASTER 005 ausente**: o checkout não contém MarketplaceStore nem o pipeline de importação/
  mapeamento de SKU. Quando disponível, a loja com ownership_type PARTNER deverá referenciar
  `partner_profiles` (ou Company) por FK composta com organization_id, sem duplicar lojas e sem
  consumir MarketplaceSale para baixar estoque nesta fase.
- Harness testa PostgreSQL/RLS com auth mínimo, não o fluxo ponta a ponta de login Supabase.
- Upload/lista de anexos em `partner-documents` ainda não implementado (só a preparação de Storage
  e as políticas). QR Code de remessa não implementado.
- Não há liberação automática de quarentena, afirmação de saldo disponível em loja, editor de itens
  de documento consolidado (cancelar e recriar o rascunho), nem workflow de anulação de devolução
  errada.
- Transitório em duas etapas e recebimento parcial de remessa (delivery parcial) exigirão evolução
  explícita de estados; hoje DELIVERED é pontual e a posição do parceiro pode incluir mercadoria
  expedida ainda sem confirmação de entrega.
- Limite de crédito, condições de pagamento, tabela de preço e reconciliação financeira ficam para
  uma extensão futura; nada financeiro fictício foi criado.

## PRÓXIMO DOMÍNIO

Reconciliação auditável/idempotente (MASTER 007) só deve começar depois de validar o MASTER 005 e o
vínculo dele com parceiros. Em paralelo seguem pendentes: ligar venda/produção/compra ao ledger,
valorização do estoque e fechamento de período.
