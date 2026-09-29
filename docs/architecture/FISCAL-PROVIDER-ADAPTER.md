# Adaptador fiscal

Estado: contrato implementado e testado; integração de fornecedor **NOT_IMPLEMENTED**. Nenhum provedor configurado ou homologado nesta entrega.

`src/lib/fiscal/provider.ts` define ambiente, submit e capacidades opcionais queryStatus, cancel, downloadXml e downloadPdf. validate/prepare/sign/submitEvent dependem do fornecedor e não são anunciados como implementados. Não há endpoint configurável arbitrário, credencial fiscal no navegador, certificado em tabela comum ou fake de produção.

`coordinateTransmission` é uma unidade de orquestração sem endpoint público. O futuro chamador deve persistir e bloquear tentativa antes do transporte. Primeira chamada usa chave estável; timeout resulta em PENDING_REMOTE_QUERY. Retry consulta estado remoto, se suportado, e **não** retransmite automaticamente, inclusive quando recebe NOT_FOUND. Ambientes diferentes são recusados antes do transporte.

Uma resposta AUTHORIZED do adaptador ainda produz PENDING_EVIDENCE na coordenação: protocolo, chave, data e XML são necessários, mas o adaptador/verificador específico deve verificar autenticidade e arquivar a evidência antes da transição oficial. Testes com adaptador injetado existem somente em Vitest; nenhum é registrado na aplicação.

`fiscal_providers` guarda metadados, ambiente, responsável e validade de certificado, sem segredo. Seu CHECK só admite PENDING_HOMOLOGATION/DISABLED: editar uma linha não habilita emissão. Não há gerenciamento real de certificados. A configuração operacional futura precisa de Secret Manager/Vault ou armazenamento equivalente e validação server-side por estabelecimento/ambiente.

`fiscal_transmission_attempts` reserva chave idempotente, ambiente, provedor, operação, estado e identificador remoto; o fluxo bloqueado não cria falsa tentativa de transporte. `fiscal_allocate_number` é privado, transacional e separado por ambiente. Cancelamento, eventos, contingência, inutilização e PDFs oficiais aguardam métodos documentados do fornecedor escolhido.

Implantação deve seguir: seleção/contrato → credenciais seguras → artefatos técnicos versionados → testes de homologação → verificação de retorno → arquivamento → transições oficiais. Não existe bypass na interface para declarar autorização manual.
