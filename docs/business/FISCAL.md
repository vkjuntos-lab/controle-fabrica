# Fiscal — MASTER 014

Revisão: 29/09/2026. Estado global **PARTIAL**. Implementação e testes locais não significam implantação ou homologação fiscal.

## Escopo e uso

A rota `/fiscal` reúne dashboard, documentos de saída, recebidos, eventos, pendências, conciliações, simulações e configuração. O módulo reutiliza organizations, companies, company_addresses, product_variants, os documentos operacionais e os ledgers existentes. Não existe outra tabela de estoque, venda ou obrigação financeira.

O papel `fiscal` tem preparação, validação, importação e consulta. Configuração e aprovação de regras pertencem às permissões próprias, normalmente admin/gestor. A permissão exibida na tela não substitui a checagem em cada RPC.

Ordem de configuração: regime → estabelecimento vinculado à Company e endereço → operação → natureza → tributos → classificação do produto e contraparte → leiaute → regra. Nenhuma tabela oficial de NCM, CFOP, tratamento ou alíquota é semeada. O usuário responsável informa os parâmetros aprovados. `business_unit_id` não é aceito enquanto não existir esse domínio; estabelecimentos são distintos e localizações físicas podem ser vinculadas explicitamente a eles.

A natureza percorre DRAFT → REVIEW → APPROVED → ACTIVE. O autor não aprova a própria natureza. Classificações e contrapartes possuem versões; perfis aprovados não são editáveis. Leiautes registram fonte, publicação, vigência, implantação e notas de homologação. Ativação interna não comprova certificação pelo fisco.

## Fluxos separados

- A expedição/recebimento/transferência operacional escreve o Inventory Ledger.
- A política comercial/compra existente escreve recebíveis e obrigações.
- O módulo fiscal referencia esses fatos, captura parâmetros e calcula tributos. Preparar, importar e conciliar não lançam estoque, títulos, pagamentos nem custos.
- Cancelamento fiscal não é estorno automático. Nenhum evento oficial é fabricado.

## Limites

NF-e é o único modelo de preparação e leitura de XML. NFC-e e NFS-e não têm emissão nem importação operacional. Sem provedor contratado/configurado, não há assinatura, transmissão, autorização, cancelamento remoto, CC-e ou contingência. A interface e o servidor bloqueiam emissão real.

Documentação específica: [regras](TAX-RULES.md), [documentos](FISCAL-DOCUMENTS.md), [recebidos](INBOUND-FISCAL-DOCUMENTS.md), [conciliação](FISCAL-RECONCILIATION.md), [reforma](TAX-REFORM-READINESS.md). Aceite e limitações completas: [relatório](../handoff/MASTER-014-VALIDATION.md).
