# Eventos fiscais e integração com o ERP

O módulo reutiliza `domain_events` como outbox transacional. `fiscal_emit` é helper privado; authenticated não pode fabricar eventos diretamente.

| Evento | Momento | Efeito automático nos outros domínios |
| --- | --- | --- |
| FISCAL_DOCUMENT_PREPARED | documento e itens capturados | nenhum |
| FISCAL_DOCUMENT_STATE_CHANGED | validação/conferência interna | nenhum |
| FISCAL_INBOUND_IMPORTED | leitura estrutural registrada, UNVERIFIED | nenhum |
| FISCAL_RECONCILIATION_RECORDED | nova execução de conferência | nenhum |

Payload contém identificadores, status e schema_version, sem XML integral, certificado ou credencial. A chave de evento deduplica preparação e estado por documento. Emissão ocorre na mesma transação da escrita; rollback remove ambos.

`fiscal_events` registra estados internos com autoria. Evento oficial exige protocolo/evidência do provedor e ainda não possui consumidor operacional. Cancelar não apaga o documento original e não deveria executar estorno genérico: essa integração futura deverá acionar fluxos autorizados de cada domínio, com chave única de origem.

`fiscal_audit` grava alterações de cadastros, perfis, regra, revisão, regressão, simulação, preparação, validação, conferência, bloqueio por provedor, importação, conciliação, resolução, exportação e solicitação de download. Helpers não têm EXECUTE para authenticated. Evidências, capturas, itens e revisões não aceitam UPDATE/DELETE.

A API usa o JWT do usuário via `requireSupabaseAuth`, RPCs com search_path fixo e permissões no banco. Tabelas fiscais são SELECT-only para authenticated sob RLS por organização/permissão; Storage privado valida o vínculo do caminho com um documento da organização. A tela não é a fronteira de segurança.
