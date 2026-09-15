# Módulo de Backend - Fundação KS MultiMake (100%)

Este documento detalha as rotinas fundamentais de backend implementadas para garantir a robustez, segurança e escalabilidade do sistema.

## 1. Segurança e Isolamento (RLS)
- **Isolamento de Loja**: Todas as tabelas críticas (pedidos, clientes, estoque, financeiro) possuem políticas de RLS baseadas em `store_id`.
- **RBAC (Role-Based Access Control)**: Uso da função `public.has_role` em políticas de segurança para restringir ações por perfil (admin, manager, vendedor).
- **Shadowing Protection**: Todas as funções `security definer` possuem `set search_path = public` configurado.
- **Auditoria**: Rotina `pdv-audit.ts` integrada às `server functions` para log de mutações sensíveis.

## 2. Infraestrutura de Server Functions
- **Middleware de Autenticação**: Registro no `src/start.ts` para anexar o token Supabase automaticamente.
- **Validação de Input**: Uso sistemático de `zod` em todas as rotinas para sanitização de dados.
- **Tratamento de Erros**: Sistema de captura centralizado (`lovable-error-reporting.ts`) com logs estruturados.

## 3. Webhooks e Integrações
- **Assinatura HMAC**: Validação de segurança para webhooks do WhatsApp e Instagram.
- **Logs de Webhook**: Persistência e auditoria de payloads externos para depuração.
- **Retentativa Automática**: Lógica de reenvio para falhas temporárias em integrações de mensageria.

## 4. Governança de Dados
- **Rate Limiting**: Implementado em rotinas públicas e de autenticação.
- **Feature Flags**: Controle granular de funcionalidades via `pdv-feature_flags`.
- **Health Checks**: Monitoramento de saúde da conexão com o banco e serviços externos.

---
**Status: 100% Concluído**
