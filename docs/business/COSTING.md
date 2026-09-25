# Custeio industrial

Custo não é preço. O Cost Engine calcula custos no PostgreSQL, usando os registros oficiais de materiais, BOM, produção e unidades. O frontend apresenta o resultado; não mantém fórmulas paralelas.

## Fontes e versões

`MaterialCostVersion` identifica variante, unidade, valor, origem, motivo e vigência. O cadastro manual exige `costs.manage_material_cost`. Uma nova vigência encerra a anterior, sem modificar seu valor. O módulo posterior de Compras já presente no checkout integra suas próprias políticas de aquisição; o cadastro manual não inventa compras.

`LaborRate` é custo por hora de atividade, não salário. `cost_routing_steps` registra minutos padrão por BOM/atividade com vigência; `production_labor_entries` registra minutos reais por ordem, data, motivo e chave de idempotência.

`OverheadRule` suporta PER_UNIT, PERCENTAGE_OF_DIRECT_COST e LABOR_HOUR. Há uma regra organizacional vigente por data, com vínculo opcional à categoria financeira e centro de custo. Não existe taxa implícita. Ausência de regra aparece como OVERHEAD_NOT_CONFIGURED e zero explicitamente identificado. MACHINE_HOUR, PRODUCTION_VOLUME e CUSTOM não são métodos implementados.

`ProductCostVersion` preserva decomposição, fontes, método, BOM, vigência, fingerprint, responsável, aprovação e cálculo. DRAFT → aprovação → ACTIVE; a versão padrão anterior passa a SUPERSEDED. ARCHIVED é permitido para rascunhos. Custo real não substitui automaticamente custo padrão.

Vigências de custos são intervalos [início, fim): início inclusivo, fim exclusivo. Valores são tratados como BRL; não há motor cambial. Datas de ocorrência convertidas pelo banco devem usar o fuso operacional acordado antes de importar dados externos.

## Fórmulas oficiais

- Material base = quantidade da BOM × fator oficial de conversão × custo na unidade da versão do material.
- Perda prevista = custo base × scrap_percentage / 100. Base e perda são exibidas separadamente. R$20 com 5% gera R$20 de material + R$1 de perda.
- Embalagens e componentes são classificados pelo `item_type` da variante consumida. Uma embalagem na BOM não recebe lançamento duplicado.
- Mão de obra = minutos × custo-hora / 60.
- Overhead por unidade = taxa × unidades; percentual = taxa% × (materiais + componentes + embalagem + perda + mão de obra); por hora = taxa × minutos / 60.
- Total unitário = material + componentes + embalagem + mão de obra + perdas + overhead + outros custos justificados, dividido pela produção boa no método real.

Conversão utiliza somente `unit_conversions`, direta ou inversa, com prioridade para a organização. Não assume que um rolo tem 50 metros. Essa equivalência precisa ser cadastrada. Fontes preservam o fator utilizado.

## Standard Cost e Actual Cost

STANDARD usa BOM vigente, custos de materiais na data de custeio, perda prevista, roteiro e taxas configuradas. O cálculo é de um nível da BOM: um semiacabado utilizado como componente necessita custo de material próprio; não há expansão recursiva automática de custos.

ACTUAL_PRODUCTION exige ordem concluída. Consumos e perdas reais precisam estar vinculados a movimentos POSTED não estornados; o denominador vem dos apontamentos de produção boa vinculados ao ledger. Os custos dos rejeitos são absorvidos pelas unidades boas. Exemplo: R$4.000 distribuíveis / 80 boas = R$50, mesmo quando foram planejadas 100. Não há política alternativa de reprocesso implementada.

Taxas de materiais e mão de obra reais são selecionadas na data do apontamento. Overhead é selecionado na data do cálculo da ordem. Apontamentos reais ausentes quando há roteiro obrigatório deixam o cálculo incompleto. Outros custos são totais da ordem no método real e por unidade no padrão; exigem descrição.

## Publicação, simulação e pendências

`cost_calculate` recebe até 100 variantes e registra `CostCalculationRun`. Fingerprints evitam versões idênticas para os mesmos inputs; o log da execução permanece. Ausência de BOM, material, conversão, produção boa ou taxa exigida bloqueia aprovação/publicação com INCOMPLETE. Não é interpretada como custo zero.

Simulação usa o mesmo motor com substituições temporárias de material, perda, mão de obra ou overhead. Não cria versão oficial nem muda preços. `/custos/impacto` lista BOMs afetadas pela simulação de um material. Mudança de material disponibiliza recálculo; nunca altera automaticamente um custo publicado.

Rotas: `/custos`, `/custos/insumos`, `/custos/calcular`, `/custos/versoes`, `/custos/simulador`, `/custos/impacto`, `/custos/producao`. O último compara padrão e real; apontamentos são cadastrados em Configurações.

## Segurança e rastreabilidade

Todas as novas entidades têm organization_id, RLS de leitura e escrita somente por RPC. Permissões: costs.read, costs.calculate, costs.simulate, costs.approve, costs.publish, costs.manage_material_cost, costs.manage_labor_rate, costs.manage_overhead. Seeds somente para admin/gestor; visualizar produtos não concede custos.

O campo legado `product_variants.cost_price` permanece armazenado, mas foi retirado da API/editor do catálogo e de privilégios diretos de authenticated. Não concorre com versões oficiais. Audit Log registra ação, usuário e referência ao registro protegido; os valores e fontes ficam nas entidades sujeitas à permissão de custos.

Custeio não cria movimentos de estoque, receita, recebimento ou lançamento financeiro. Inventory Ledger continua sendo a fonte quantitativa oficial.
