# KS MultiMake — Runbook Operacional & DR

## 1. Monitoramento e Saúde
- O endpoint `/api/health` (via server function `checkHealth`) retorna o status do runtime.
- Logs estruturados em JSON são emitidos para o stdout e podem ser coletados por ferramentas de observabilidade.

## 2. Feature Flags
- Geridas na tabela `pdv_feature_flags`.
- Use a interface em `/pdv/configuracoes` (em breve) ou via server functions em `src/lib/feature-flags/`.

## 3. Disaster Recovery (DR)
- **Backup:** O banco de dados (Supabase) realiza backups diários automáticos.
- **PITR:** Point-in-Time Recovery disponível para janelas de 7 dias.
- **Restore:** Em caso de falha crítica, o restore deve ser solicitado via console do provedor Lovable Cloud.

## 4. CI/CD
- Todo merge em `main` dispara o workflow `.github/workflows/ci.yml`.
- Requisitos para deploy: Passar no Lint, Typecheck e Testes Unitários.
