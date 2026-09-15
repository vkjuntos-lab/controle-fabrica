# Arquitetura de Banco de Dados KS MultiMake (100%)

Este documento detalha a estrutura de banco de Dados implementada, garantindo integridade, segurança e isolamento multi-inquilino (multi-tenant).

## 1. Schema e Tabelas Core
- **Empresarial**: `stores`, `payment_gateways`, `fiscal_settings`.
- **Catálogo**: `products`, `product_brands`, `product_categories`, `product_batches`, `batch_items`.
- **Vendas & CRM**: `sales`, `customers`, `customer_loyalty`, `user_roles`.
- **Financeiro**: `receivables`, `payables`, `cashflow_logs`, `payment_split_entries`.
- **Fiscal**: `fiscal_documents`, `fiscal_tax_profiles`, `fiscal_queue`.
- **Omnichannel**: `wa_templates`, `ig_logs`, `wa_webhook_logs`.

## 2. Segurança de Dados (RLS & Permissões)
- **Grant System**: Todas as tabelas no schema `public` possuem permissões explícitas `GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated;`.
- **Isolamento de Loja**: Uso sistemático de `store_id uuid` em todas as tabelas transacionais, com políticas de RLS vinculadas ao contexto do usuário.
- **Funções de Segurança**: `has_role(_user_id uuid, _role app_role)` definida com `SECURITY DEFINER` e `search_path = public`.

## 3. Integridade e Performance
- **Índices**: Cobertura completa para `store_id`, `created_at` e chaves estrangeiras.
- **Constraints**: Validação de integridade referencial com `ON DELETE CASCADE` configurado.
- **Triggers**: Auditoria automática via triggers para logs sensíveis.

---
**Status: 100% Concluído**
