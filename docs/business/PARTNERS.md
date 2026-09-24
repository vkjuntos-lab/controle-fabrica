# Empresas e parceiros — MASTER 006

## Estado e limites

Implementação operacional no código, validada em PostgreSQL local. Publicação e smoke test
autenticado continuam pendentes. Na continuação de 24/09/2026, o checkout já contém
`marketplace_stores`, cadastro de lojas e reconciliação do MASTER 007, além de schema financeiro.
A aba Marketplaces do Parceiro 360 reutiliza essas lojas e seu vínculo com PartnerProfile.
O importador automático MASTER 005 permanece pendente; não foi criado cadastro paralelo de lojas.

## Regras empresariais

- **Remessa não é venda.**
- **Remessa não gera automaticamente contas a receber.**
- **Estoque do parceiro é derivado do Inventory Ledger.**
- **Devolução não altera a remessa histórica.**
- **Quantidade enviada e quantidade vendida são conceitos diferentes.**
- Posse física não altera propriedade automaticamente. Estoque em posse de terceiro pode continuar
  sendo propriedade da organização. Este módulo não atribui transferência de titularidade nem
  inventa saldo disponível, reservado, valores, dívida ou vendas reconciliadas.

## Company e relações comerciais

`companies`: UUID, organization_id, código, razão social, nome fantasia, tipo/número de documento,
inscrição estadual, email, telefone, website, status, observações, autoria e timestamps.
`company_roles`: relações PARTNER, CUSTOMER, SUPPLIER e RESELLER, simultâneas e únicas por empresa.
Nesta versão as relações são acrescentadas e preservadas; não há remoção de papéis históricos.

Código é único por organização. Documentos preenchidos são normalizados no servidor (maiúsculas,
sem pontuação de apresentação) e únicos por organização/tipo/número. CPF exige 11 dígitos; CNPJ
exige formato de 14 caracteres (12 alfanuméricos e 2 dígitos). A validação é de **formato**, não
consulta Receita nem valida titularidade/dígitos verificadores. OTHER preserva a possibilidade
internacional. Documento não é chave primária. SQL e Zod validam o cadastro; RPC pode ser chamada
sem depender do formulário.

Status ACTIVE, INACTIVE e BLOCKED preservam histórico. Bloquear/desbloquear exige `partners.block`
além de permissão de cadastro/edição. Bloqueio exige motivo e registra autor/data. Parceiro inativo
ou bloqueado não pode criar, aprovar ou expedir remessa. Devoluções continuam permitidas.

`company_contacts`: múltiplos contatos, cargo, email, telefone, WhatsApp, principal, status e notas.
No máximo um contato principal ativo. `company_addresses`: vários endereços HEADQUARTERS, SHIPPING,
BILLING, OTHER; um principal por tipo, endereço completo e país. As alterações geram auditoria.

## PartnerProfile e InventoryLocation

Ao acrescentar PARTNER, `partner_save_company` cria, **na mesma transação**, perfil e localização
PARTNER, vinculada por `inventory_locations.partner_id = partner_profiles.id` e pela localização
padrão do perfil. Perfil inclui código operacional, status e frequência prevista WEEKLY, BIWEEKLY,
MONTHLY ou CUSTOM. Frequência é apenas cadastro; não executa fechamento.

A tela existente `/estoque/locations` permite associar outras localizações sem histórico ao perfil.
Vínculos com histórico, remessas ou usados como localização padrão não podem mudar de parceiro/tipo.
Trigger valida mesma organização; perfil padrão deve apontar localização do próprio parceiro.
Localizações PARTNER antigas sem perfil continuam existindo e aparecem no estoque geral; sua
vinculação histórica requer migração explícita, não associação automática pelo nome. A FK adicionada
como NOT VALID preserva legados e verifica novos vínculos; a validação global depende de revisão dos
IDs antigos, caso existam. A consulta do domínio inclui localizações efetivamente ligadas a perfis.

`operational_purpose` na localização: NORMAL, QUARANTINE ou INSPECTION. Campo configurável na tela de
localizações. Devolução não vendável exige os dois últimos; não há liberação automática para venda.

## Posição, inventário e relatórios

As consultas são server-side com página de 50 registros, organização e permissões obrigatórias.
Posição atual usa o mesmo ledger POSTED; posição histórica filtra `occurred_at` até o fim da data
UTC escolhida. Totais quantitativos, sem dinheiro. Mostra SKU, variante, localização, on hand,
enviado/devolvido acumulados, última remessa e movimento. Acumulados são tipos/direções no ledger;
não são unidades vendidas. Itens/SKUs distintos e unidades são métricas separadas.

`/parceiros`: empresas, busca, status e dashboard real com período.
`/parceiros/empresas/$id`: Parceiro 360, dados, contatos, endereços, remessas, estoque, devoluções,
histórico operacional e lojas vinculadas, com paginação e estado de acesso negado. Histórico do ledger paginado inclui
entradas, saídas, remessas, devoluções e ajustes nas localizações do parceiro.
`/parceiros/estoque`: busca por parceiro/produto/SKU/barcode, categoria e data; CSV completo dos filtros.
Listas de remessas/devoluções incluem relatórios por SKU, período e CSV com condição/motivo nas devoluções.
Exportações consultam as mesmas RPCs paginadas e neutralizam fórmulas em campos textuais para planilhas.
Não há exportador XLSX neste domínio.

Ajuste reutiliza `MovementDialog`/Inventory Service e exige simultaneamente `inventory.adjust` e
`partner_inventory.adjust`; o banco exige a permissão de parceiro, inclusive em chamada direta.
Contagem reutiliza InventoryCount: `inventory.count`, bloqueio da localização durante a contagem,
comparação e confirmação. Aplicar divergências também exige permissões de ajuste. Não há ajuste
silencioso. Divergências quantitativas abertas vêm dos itens de contagem; Central de Exceções com
UNKNOWN_ITEM/DAMAGED_ITEM ainda não existe.

## RBAC, RLS e auditoria

Permissões: `partners.read/create/update/block`, `partner_contacts.manage`, `partner_addresses.manage`,
`partner_shipments.read/create/approve/pick/ship/receive/cancel`, `partner_returns.read/create/receive`,
`partner_inventory.read/adjust`. Reutilizam `role_permissions` e `has_permission`.
Defaults: admin/gestor/estoque recebem operação completa; comercial/financeiro/marketplace/producao
recebem leitura. A matriz existente pode ser ajustada. Formulários de operação reutilizam consultas
de catálogo/estoque e precisam de `partners.read` e `inventory.read`; categorias usam `products.read`.

As nove tabelas novas têm RLS e SELECT conforme permissão do domínio. Authenticated não possui escrita
direta; RPCs SECURITY DEFINER validam auth.uid, organização, referências e permissão específica. Núcleo
do ledger permanece privado. Triggers impedem exclusão e alteração de fatos consolidados. Não há
outro sistema de autorização. Audit Log recebe cadastro/bloqueio, contatos, endereços, cada transição,
quantidades de picking, conclusão da separação, transferências e devoluções com referências ao ledger.

## Integrações e próximos módulos

`marketplace_stores` existente possui `ownership_type = PARTNER` e FK composta
(organization_id, partner_id) para `partner_profiles`. O cadastro existente `marketplace_save_store`
aplica `marketplace.manage`; a leitura da aba usa `rec_query`, que exige `reconciliation.read`.
A interface foi alinhada a esses nomes reais do banco, sem criar permissões substitutas.
Teste de integração aplica as migrations de parceiros, reconciliação e financeiro e confirma que
remessa/devolução não criam `marketplace_sales`, `account_receivables`, `financial_transactions`
ou `partner_reconciliations`. O vínculo de loja não reconcilia venda automaticamente.

Limite de crédito, condições de pagamento, tabela de preço e preferências de cobrança ficam reservados
para uma extensão relacionada à Company, sem colunas/efeitos financeiros fictícios nesta versão.
O MASTER 007 já existe neste checkout e permanece preservado. A pendência de integração é validar
o importador MASTER 005 contra o contrato de lojas/vendas existente. Ver `PARTNER-SHIPMENTS.md` e `../handoff/MASTER-006-VALIDATION.md`.
