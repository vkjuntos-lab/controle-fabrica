# MASTER 014 — Fiscal: relatório de validação

Revisão: 29/09/2026. Estado global: **PARTIAL**. Implementação local; migrations **não aplicadas**
no banco publicado, provedor fiscal **não homologado** e aceitação visual em navegador autenticado
**não verificadas**.

## 1. Diagnóstico

A entrega inicial do fiscal estava no commit `48631ed`, com seis migrations
(`20261013100000` a `20261014400000`), gateway, rota `/fiscal` e interface. O `PROJECT-STATE.md`
continuava dizendo que o MASTER 014 não tinha sido iniciado.

Typecheck, build e 91 testes Vitest passavam. A auditoria tela × banco encontrou duas famílias de
defeito que nenhum deles alcança.

### 1.1 O banco de teste não era o banco real

O harness do fiscal, `scripts/test-fiscal-workflow-db.py`, aplica um **recorte curado** de
migrations começando em `20260926`. O histórico do projeto tem migrations de julho e agosto que
ocupam dois nomes usados pelo fiscal:

- `20260706150230` cria `public.fiscal_environment` com os rótulos **minúsculos**
  (`'homologacao'`, `'producao'`). A `20261013100000` o redeclara com rótulos maiúsculos e aborta
  com `type "fiscal_environment" already exists`.
- `20260706150307` cria `public.fiscal_documents` com outro desenho: `kind`, `serie`, `numero`,
  `chave`, `danfe_url`, `qrcode_url`, `xml_authorized`, `provider='focus'`. A `20261014200000` a
  recria e aborta com `relation "fiscal_documents" already exists`.

Ou seja: **a cadeia do MASTER 014 não era aplicável sobre o histórico completo**, e o recorte do
harness escondia exatamente isso. Nenhum teste de unidade, nenhum typecheck e nenhum build detectam
uma migration que aborta.

### 1.2 Divergência entre o que a tela promete e o que o servidor exige

| Onde | Permissão da tela | Permissão do servidor | Efeito |
| --- | --- | --- | --- |
| `products` | `fiscal.tax_rules.read` | `fiscal.read` (via `ELSE`) | quem administra classificação sem a leitura ampla abre a área e não consegue abrir seletor |
| `simulations` | `fiscal.simulate` | `fiscal.read` (via `ELSE`) | histórico de simulações visível para quem não pode simular |
| `providers` | `fiscal.provider.manage` | `fiscal.read` (via `ELSE`) | lista de provedores visível para quem não pode habilitar nenhum |
| `establishments`, `regimes`, `operations`, `natures`, `taxes`, `layouts`, `companies` | `fiscal.configure` (gravação) | `fiscal.read` (leitura) | quem só consulta fiscal não vê os cadastros que o servidor já lhe libera |

Um papel com apenas `fiscal.configure` foi recusado em nove áreas. A navegação e o servidor discordavam
nos dois sentidos.

### 1.3 Permissões órfãs

A `20261013200000` concedeu `fiscal.documents.read`, `fiscal.documents.prepare`,
`fiscal.documents.transmit` e `fiscal.export`. Nenhum desses nomes existe no catálogo de
`src/lib/rbac.ts`: as canônicas são `fiscal.read`, `fiscal.documents.create`,
`fiscal.documents.issue` e `fiscal.reports.export`. Conceder `fiscal.export` ao papel "fiscal" não
destrava botão nenhum, e a tela de permissões do administrador lista quatro chaves que nenhum
`fiscal_require` consulta.

### 1.4 Evidência que existia no banco e não tinha leitura

- `tax_calculation_snapshots` — a única evidência de **qual regra** produziu **qual valor** — não era
  devolvido por nenhum caminho de leitura. O detalhe do documento mostrava o cabeçalho como JSON cru,
  sem nenhum tributo.
- `fiscal_rule_regressions` — a prova de que a regra foi testada antes de virar vigente — era invisível.
- `tax_rule_reviews` — a trilha `REVIEW → DRAFT` — não tinha tela, e a ação `review`, que existe no
  banco desde a `20261014100000`, não tinha botão.
- `fiscal_exceptions.responsible_id` — a coluna existia e `fiscal_exception_action` a gravava, sem
  nenhuma forma de escolher o responsável.

### 1.5 Listagem genérica

A tabela de cada área era a mesma, com `label(row)`, `status`, uma coluna de data e uma de total. O
resultado era UUID em documentos, recebidos, eventos, pendências, conciliações e simulações, e apenas
número de versão em perfis, regras e leiautes. Onze áreas, nenhuma declaring o que é o registro.

### 1.6 Defeitos de formulário

- `Reference` perdia a escolha: digitar na pesquisa eliminava a opção selecionada do `<select>` e o
  formulário passava a enviar vazio onde havia registro válido.
- Campo de referência é um `<select>` dentro de um `<div>`: o `required` do HTML não se aplica, e
  referência obrigatória omitida chegava ao servidor como chave ausente.
- Não havia filtro de estabelecimento, embora o estado `establishment` existisse e o servidor o
  respeitasse em documentos, recebidos e dashboard.

## 2. Implementado

### 2.1 Migrations

`20261013100000_fiscal_core.sql` e `20261014200000_fiscal_documents.sql` foram corrigidas **no
local**, e não por migration nova. A instrução de não reescrever migration publicada vale para
migration já aplicada; estas não foram aplicadas em nenhum ambiente, e a correção tem de acontecer
antes de elas rodarem — uma migration posterior chega tarde demais para a 131 e a 142 abortarem.

- `20261013100000`: `CREATE TYPE public.fiscal_environment` passa a ser idempotente e **renomeia** os
  rótulos legados em vez de recriar o tipo, de modo que a coluna legada que ainda o usa continua válida.
- `20261014200000`: `DROP TABLE IF EXISTS public.fiscal_documents CASCADE` explícito, com comentário
  registrando que o esqueleto de julho não é referenciado por nenhuma migration posterior nem por
  nenhum arquivo de `src/`.

`20261014500000_fiscal_screen_fixes.sql`, nova e aditiva:

- Remove as quatro permissões órfãs.
- `fiscal_query`: `products`, `simulations` e `providers` deixam de cair no `ELSE 'fiscal.read'` e
  passam à permissão que a navegação declara; `regressions` entra como área.
- `fiscal_query`, `detail`: devolve `taxes` (`tax_calculation_snapshots` por item), `items` e `events`
  — a mesma evidência que já era gravada e imutável, sem caminho de leitura.
- `fiscal_query`, `rule_detail` (novo): `reviews`, `regressions` e `items` da regra.
- `fiscal_query`, `assignees` (novo): membros ativos da organização, para atribuir responsável.

### 2.2 Contrato de permissões na navegação

As sete áreas de cadastro passam a exigir `fiscal.read` para **listar**; `fiscal.configure` volta a
valer apenas para o botão de novo cadastro, que é onde ela pertence. Nenhuma permissão de leitura
alguém foi removida: quem já lia esses cadastros pelo servidor passa a vê-los.

### 2.3 Listagens declaradas

`src/lib/fiscal/constants.ts` passa a declarar, por área, as colunas que existem na tabela da área,
com rótulo de domínio. Documento abre por número e série com a chave de acesso; pendência abre pelo
tipo com gravidade e responsável; conciliação mostra os achados traduzidos; simulação mostra tributos,
bloqueio e advertências; regra mostra versão, prioridade e vigência.

### 2.4 Detalhe

- `DocumentDetail`: itens com NCM, quantidade, valor, e por item o tributo, o tratamento, a versão e a
  base da regra que o produziu, e o valor apurado — além da trilha de eventos.
- `RuleDetail`: regressões com impressão da regra e resultado, revisões com transição, decisão e
  justificativa, e os tratamentos da versão.

### 2.5 Ações

- **Devolver para ajuste**: regra em `REVIEW` volta a `DRAFT` pela ação `review`, que já existia no
  banco sem botão na tela.
- **Atribuir e iniciar / Concluir pendência**: escolhe o responsável entre os membros ativos e move a
  pendência para `IN_REVIEW` ou `RESOLVED`, com a trilha de histórico que o banco já grava.
- **Filtro de estabelecimento** em documentos, recebidos, conciliações, eventos e pendências.

### 2.6 Formulário

`Reference` preserva a escolha corrente quando ela sai da pesquisa. `FiscalForm` valida os campos
obrigatórios — inclusive os de referência, que o HTML não cobre — e nomeia o que falta em vez de
mandar a chave omitida ao servidor.

### 2.7 Aviso de divergência

Quando a permissão da área e a do servidor divergem, a área mostra um aviso que diz o que está
faltando. Não é conserto: é para que a falha fique visível em vez de virar um formulário que abre e
não lista nada.

## 3. Critérios de aceite

| Critério | Estado | Evidência / limite |
| --- | --- | --- |
| Cadeia aplicável sobre o histórico real | IMPLEMENTED | `test:fiscal:chain`: colisão de julho reproduzida, MASTER 014 aplica |
| Colisão de enum tratada sem quebrar coluna legada | IMPLEMENTED | cadeia: `fiscal_environment` termina `HOMOLOGATION,PRODUCTION` |
| `fiscal_documents` substituído pelo desenho definitivo | IMPLEMENTED | cadeia: `establishment_id`, `access_key`, `document_number` presentes |
| Permissão de leitura coerente com a navegação | IMPLEMENTED | `constants.test.ts` compara tela × `fiscal_query` |
| Nenhuma permissão fiscal fora do catálogo | IMPLEMENTED | cadeia: comparação com `src/lib/rbac.ts` |
| Snapshot tributário visível no detalhe | IMPLEMENTED | `detail.taxes`; cadeia verifica a definição |
| Regressão e revisão visíveis | IMPLEMENTED | área `regressions` e `rule_detail` |
| Regra pode voltar a ajuste | IMPLEMENTED | ação `review` com botão e justificativa |
| Pendência tem responsável | IMPLEMENTED | `assignees` + atribuição com trilha |
| Colunas de listagem existem na tabela | IMPLEMENTED | `constants.test.ts` sobre as migrations |
| Nenhuma área abre com UUID ou md5 | IMPLEMENTED | `constants.test.ts` |
| Todo código traduzido | IMPLEMENTED | `constants.test.ts` sobre enums e CHECKs |
| Escolha do seletor preservada | IMPLEMENTED | `Reference` |
| Referência obrigatória validada | IMPLEMENTED | `FiscalForm` |
| Filtro de estabelecimento | IMPLEMENTED | `Area`, com o `establishment_id` que o servidor já respeitava |
| Motor tributário e ciclo de regra | IMPLEMENTED | grupos A–AT e W1–W10 do harness existente |
| Importação e conciliação de recebidos | IMPLEMENTED | grupos W4–W6 |
| Transmissão ao ambiente oficial | NÃO IMPLEMENTADO | nenhum provedor homologado; botão desabilitado |
| Contingência e evento oficial | NÃO IMPLEMENTADO | sem provedor; nada é FABRICADO |
| Integração | PARTIAL | PostgreSQL isolado; navegador autenticado não testado |
| Implantação publicada | NÃO VERIFICADA | nenhuma migration aplicada no banco de destino |

## 4. Não implementado

Transmissão, cancelamento, contingência e eventos oficiais; qualquer estimativa de tributo sem regra
aprovada; apuração de IBS/CBS (as colunas existem e não são calculadas); leitura de NF-e por
provedor; assinatura digital do DANFE. Nada disso é apresentado como funcionando, e o botão de
transmissão continua desabilitado com o motivo visível.

## 5. Arquivos

Criados:

- `src/lib/fiscal/constants.ts`
- `src/lib/fiscal/constants.test.ts`
- `supabase/migrations/20261014500000_fiscal_screen_fixes.sql`
- `scripts/test-fiscal-migration-chain.py`
- este documento

Modificados: `20261013100000_fiscal_core.sql` e `20261014200000_fiscal_documents.sql` (colisões com o
histórico), `src/components/fiscal/config.ts`, `src/components/fiscal/form.tsx`,
`src/components/fiscal/workspace.tsx`, `scripts/test-fiscal-workflow-db.py` (inclui a 145) e
`package.json` (`test:fiscal:chain`).

Removidos: `scripts/_probe-fiscal.py`, `scripts/_probe-sales.py` e
`scripts/_check-sales-migration.py` (sondas temporárias de sessões anteriores).

## 6. Migrations e tabelas

As seis migrations originais foram preservadas, com a correção de aplicabilidade descrita em 2.1. A
nova migration não cria nem altera tabela: substitui `fiscal_query` e apaga quatro linhas de
`role_permissions`. O módulo tem 31 tabelas, entre elas `fiscal_documents`, `fiscal_document_items`,
`fiscal_events`, `fiscal_exceptions`, `fiscal_reconciliations`, `inbound_fiscal_documents`,
`fiscal_establishments`, `fiscal_tax_regimes`, `fiscal_operation_types`, `fiscal_operation_natures`,
`fiscal_taxes`, `fiscal_layout_versions`, `product_fiscal_profiles`, `company_fiscal_profiles`,
`tax_rules`, `tax_rule_items`, `tax_rule_reviews`, `fiscal_rule_regressions`, `tax_calculation_snapshots`,
`fiscal_simulations` e `fiscal_providers`.

O snapshot é imutável por trigger: um trigger de `BEFORE UPDATE OR DELETE` levanta exceção, e a
integridade é garantida também para escrita privilegiada (grupo W8).

## 7. Rotas

`/fiscal` com `?view=`. As dezoito áreas são: dashboard, documentos de saída, recebidos, eventos e
cancelamentos, pendências, conciliações, simulações, estabelecimentos, contrapartes, classificações,
regras tributárias, regressões de regra, regimes, operações, naturezas, tributos, versões técnicas e
integração. A navegação continua filtrando por permissão e o caminho não mudou.

## 8. Verificações

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | sem erro |
| `npx eslint src/components/fiscal src/lib/fiscal` | 0 erros, 2 avisos de Fast Refresh em `form.tsx` |
| `npm test` | 103 testes, 10 arquivos, todos passando |
| `npm run build` | sucesso (avisos de `node_modules` pré-existentes) |
| `npm run test:fiscal:db` | grupos A–AT e W1–W10, todos passando |
| `npm run test:fiscal:chain` | colisão reproduzida, cadeia do MASTER 014 aplicável |

### 8.1 Sobre o harness de banco

`scripts/test-fiscal-migration-chain.py` sobe um PostgreSQL descartável, aplica as duas migrations de
julho que criam os legados, aplica as predecessors e só então aplica `20261013` a `202610145`. É o
único teste que prova aplicabilidade sobre o histórico real; os demais harness continuam usando
recortes, e as colisoes entre migrations anteriores ao fiscal são registradas e não escondidas.

O harness compartilhado só limpa o diretório do cluster quando roda como programa. Importado por
`importlib`, ele deixava o cluster em `/tmp` e a segunda rodada falha com `No space left on device`;
o novo script fecha o cluster no `finally`.

## 9. Testes que impedem a regressão

`src/lib/fiscal/constants.test.ts` lê as migrations — não os tipos gerados do Supabase, que são
anteriores às tabelas fiscais — e trava doze contratos:

- toda área com listagem aponta para uma tabela que existe;
- toda coluna listada existe na tabela da área;
- nenhuma área abre com `id` ou `fingerprint`, e nenhuma lista coluna interna;
- toda área tem coluna de situação;
- a permissão de leitura de `constants.ts` é a que o `fiscal_query` cobra;
- a permissão de leitura nunca é a de gravação, com a exceção declarada de `providers`;
- todo estado de documento, origem, tipo de pendência, estado de conciliação e evento emitido tem
  rótulo, e nenhum rótulo de evento existe sem evento correspondente no banco.

Cada uma dessas asserções falhou durante esta revisão contra o código anterior: `documents` abria com
`source_type`, `simulations` não tinha situação, `products` e `simulations` divergiam do servidor, e
os `EVENT_TYPE` da tela eram `PREPARED`/`VALIDATE`/`APPROVE` enquanto o banco emite
`FISCAL_DOCUMENT_PREPARED` e outros quatro. Nenhuma delas falharia em typecheck ou build.

O teste também revelou que o parser inicial lia coluna de comentário SQL (`-- ... , ...`) como coluna
de tabela, produzindo nomes fantasma como `para`, `regras` e `com`. O parser agora remove comentários
antes de fatiar.

## 10. Limites conhecidos

- Nenhuma migration foi aplicada no banco de destino. A cadeia está provada aplicável sobre um banco
  reproduzindo o histórico, mas o banco publicado pode ter estado próprio; aplicar em produção
  exige revisar o console do Supabase.
- Não houve navegação em navegador autenticado. Ficam sem verificação prática o agrupamento das
  colunas nas dezoito áreas, o comportamento do seletor de responsável com muitos membros e a leitura
  de erro do gateway na interface.
- As colisões de nome entre migrations anteriores ao fiscal (`products`, `inventory_locations`,
  `app_role`, entre outras) continuam existindo no histórico e não foram corrigidas aqui. O novo
  harness as registra; corrigi-las é trabalho de outro módulo.
- `origin_code` perdeu o `DEFAULT 0` de propósito na `20261014100000`: a origem é declarada ou não é
  gravada. A tela de classificação exige o campo, e o formulário valida a obrigatoriedade.
- O repositório tem cerca de 12 mil problemas de formatação do Prettier em módulos de outros masters,
  fora do escopo desta revisão. Os arquivos do fiscal estão limpos.
