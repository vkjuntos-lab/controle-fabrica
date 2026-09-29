# Regras e cálculo tributário

## Governança

`tax_rules` e `tax_rule_items` preservam escopo, versão, vigência inclusiva, prioridade e autoria. Uma regra fora de DRAFT não pode ser editada por RPC. Criar nova regra não altera capturas anteriores. `fiscal_rule_action` exige DRAFT → REVIEW → APPROVED → ACTIVE; aprovação é realizada por usuário diferente do autor, com justificativa. RETIRED é terminal.

Ativar exige uma execução aprovada em `fiscal_rule_regressions`. `fiscal_test_rule` calcula no PostgreSQL cenários antes da vigência, no início e depois do término; para vigência aberta, depois do início. A referência aponta para teste da mesma organização/regra/versão. O fingerprint inclui parâmetros e itens: uma evidência anterior à alteração não pode ativar o conteúdo novo. O teste valida a aritmética configurada e vigência, não a interpretação legal ou o esquema XML oficial.

A seleção é por especificidade, prioridade menor, início mais recente e versão. A ativação serializa a organização e rejeita sobreposição do mesmo escopo nos dois sentidos. O índice legado ainda exige versões distintas para certos escopos; a numeração da versão é informada pelo responsável.

## Precisão e fórmulas efetivamente implementadas

Valores são NUMERIC, nunca float para cálculo oficial no cliente. Base, alíquota, redução e fixo são capturados com seis casas; bruto arredonda para seis e o resultado para duas, usando `round` do PostgreSQL. O total é a soma das linhas arredondadas. Esta é a convenção do motor local, **não** uma afirmação de que atende universalmente todos os tributos/leiautes.

- `BASE_CALCULO`: quantidade × preço − desconto.
- `VALOR_LIQUIDO`: quantidade × preço − desconto − frete, preservando a fórmula preexistente. Este significado exige validação expressa do responsável; não é regra fiscal geral de frete.
- `ISOLADO`: base igual ao valor fixo. Para cobrança fixa, configure alíquota zero. O fixo é por item, não uma cobrança única por documento.
- Resultado: (base − redução em valor) × alíquota em fração + fixo. Redução maior que a base, valores negativos e não finitos são recusados.

Isenção pode ser representada por tratamento explícito de alíquota zero. Recuperável e retido são flags capturadas, sem crédito ou retenção lançados no financeiro. Diferimento, ICMS-ST/MVA, crédito presumido, fórmulas compostas e apuração definitiva **não estão implementados**. JSON adicional não cria fórmula executável. Não cadastrar uma obrigação complexa como se esses três modos fossem suficientes.

## Capturas e simulações

`fiscal_simulations` registra entrada, data, regime, avisos e resultado. Produto sem perfil aprovado ou operação sem regra bloqueia. `tax_calculation_snapshots` captura regra/versão, base, alíquota, redução, bruto, arredondado, tratamento e origem dos parâmetros. UPDATE/DELETE de capturas são bloqueados por trigger; documento histórico não é recalculado.

Os escopos regionais existem no schema original, mas o simulador atual passa regiões nulas. Não há inferência de UF nem resolução geográfica completa. A preparação é preliminar; emissão segue bloqueada até essas regras serem homologadas no adaptador escolhido.
