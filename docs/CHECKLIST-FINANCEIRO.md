# Checklist de Validação — Financeiro (Contas a Pagar / Receber / Conciliação)

Objetivo: confirmar, com evidências, que as rotinas de Contas a Pagar, Contas a Receber,
provisões, alertas, juros/multa e conciliação Mercado Pago/PIX estão operacionais.

Como usar: execute cada item na loja de teste, marque o resultado e anexe a evidência
indicada (linha de `audit_log`, print da tela ou retorno da rotina).

---

## 1. Contas a Pagar

| # | Rotina | Como validar | Evidência esperada | OK |
|---|--------|--------------|--------------------|----|
| 1.1 | Cadastro de conta | `/pdv/financeiro` → aba **A Pagar** → "Nova conta a pagar" | Linha nova em `accounts_payable` com `store_id` da loja | ☐ |
| 1.2 | Regras de vencimento | Criar conta com vencimento passado e rodar `refreshOverdueStatus` | Status muda de `open` → `overdue`; `audit_log.action = finance.refresh_overdue` | ☐ |
| 1.3 | Provisão | Marcar "Esta é uma provisão" no cadastro | `notes` contém `[PROVISÃO]`; badge "provisão" na listagem | ☐ |
| 1.4 | Alerta antes do pagamento | Criar conta vencendo hoje/amanhã e abrir o Dashboard | Banner laranja "Alerta crítico: N conta(s) vencendo hoje ou amanhã" | ☐ |
| 1.5 | Baixa manual | Botão ✓ na linha | `status = paid`, `paid_at` preenchido, lançamento em `financial_transactions` (trigger `on_payable_paid`) | ☐ |
| 1.6 | Recorrência | Baixar conta com `recurring = monthly` | Nova conta criada para o mês seguinte (trigger `on_payable_paid_recurring`) | ☐ |

Consulta de evidência:

```sql
select id, description, due_date, status, notes, paid_at
from accounts_payable
where store_id = '<STORE_ID>'
order by created_at desc limit 20;
```

---

## 2. Contas a Receber

| # | Rotina | Como validar | Evidência esperada | OK |
|---|--------|--------------|--------------------|----|
| 2.1 | Cadastro | Aba **A Receber** → "Nova conta a receber" | Linha em `accounts_receivable` | ☐ |
| 2.2 | Inadimplência | `refreshOverdueStatus` com títulos vencidos | Status `overdue`; contagem no retorno da rotina | ☐ |
| 2.3 | Juros/multa | Botão ↗ (laranja) em título vencido | Alerta com juros, multa e total; `audit_log.action = receivable.charges.calculate` | ☐ |
| 2.4 | Regra de cálculo | Conferir valores | multa 2% + juros 0,033%/dia (1% a.m.) sobre o principal | ☐ |
| 2.5 | Baixa com encargos | `settleReceivableWithCharges` | `paid_amount = principal + juros + multa`; nota com o detalhamento; `audit_log.action = receivable.settle` | ☐ |
| 2.6 | Baixa automática por pagamento | Pagar um PIX/link vinculado | Trigger `on_receivable_paid` / `on_pix_approved` gera `financial_transactions` | ☐ |

Consulta de evidência:

```sql
select id, description, due_date, amount, paid_amount, status, notes
from accounts_receivable
where store_id = '<STORE_ID>' and status in ('overdue','paid')
order by due_date desc limit 20;
```

---

## 3. Conciliação Mercado Pago / PIX

| # | Rotina | Como validar | Evidência esperada | OK |
|---|--------|--------------|--------------------|----|
| 3.1 | Gateway configurado | `/pdv/gateways` (ou `payment_gateways`) com `active = true` | Registro `provider = mercadopago`, `is_default = true` | ☐ |
| 3.2 | Conciliação manual | Botão **Conciliar MP/PIX** na aba A Receber | Retorno `{ processed, matched, errors }` | ☐ |
| 3.3 | Registro da execução | Após conciliar | `audit_log.action = gateway.reconcile` com `scanned/updated/errors` | ☐ |
| 3.4 | Atualização de status | Cobrança paga no gateway e pendente no sistema | `payment_links` / `pix_charges` passam a `paid` | ☐ |
| 3.5 | Taxas e repasses | Conferir `financial_transactions` gerados | Valor líquido e taxa registrados na movimentação | ☐ |
| 3.6 | Fallback de webhook | Simular webhook perdido e rodar conciliação | Registro é atualizado mesmo sem webhook | ☐ |

Consulta de evidência:

```sql
select created_at, action, details
from audit_log
where action in ('gateway.reconcile','receivable.settle','payable.provision.create','finance.refresh_overdue')
order by created_at desc limit 30;
```

---

## 4. Logs e observabilidade

- Todas as rotinas acima gravam em `audit_log` (ator, loja, ação, detalhes em JSON).
- A conciliação grava **uma linha-resumo por execução** com totais.
- Erros de driver de gateway aparecem em `details[].error` no retorno da conciliação.
- Logs de execução do servidor: painel de logs do backend, filtrando por `reconcile` ou `finance`.

## 5. Critério de conclusão

O módulo é considerado 100% concluído quando todos os itens das seções 1 a 3 estiverem
marcados e existir pelo menos uma linha de `audit_log` correspondente a cada ação listada
na seção 4.
