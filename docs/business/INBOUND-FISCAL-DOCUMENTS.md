# Documentos fiscais recebidos

## Importação suportada

O servidor lê `nfeProc` de NF-e modelo 55, versão 4.00, no namespace `http://www.portalfiscal.inf.br/nfe`. Usa XMLTABLE/xpath do PostgreSQL, sem extrair conteúdo por regex. Regex apenas rejeita DTD/entidades e verifica forma da chave. Limite: 2 MB e 500 itens.

São conferidos raiz/versão, chave de 44 dígitos e dígito verificador, modelo, ambiente do estabelecimento, chave do protocolo, código declarado 100, presença de protocolo, emitente versus Company do SupplierProfile, destinatário versus estabelecimento e quantidade/preço/total dos itens. A importação preserva classificações e XML de tributos, sem reinterpretá-los.

**A validação é estrutural parcial.** Não há validação XSD do pacote RTC vigente, assinatura digital, cadeia de certificado ou consulta SEFAZ. Por isso `authenticity_status` permanece UNVERIFIED e o documento nasce PENDING_VERIFICATION. Um XML com protocolo declarado jamais autoriza um documento de saída.

A chave é única por organização/ambiente. Retry com os mesmos bytes retorna o registro; mesma chave com hash SHA-256 diferente é recusada. Fornecedor é selecionado explicitamente, sem dedução por nome.

## Arquivamento e retry

`importFiscalXml` primeiro registra o documento via RPC e depois envia os bytes originais ao Storage autenticado, sem service role. Upload é append-only e não faz upsert. Falha de upload não é apresentada como sucesso: reenviar o mesmo arquivo conclui o arquivamento. Se o caminho já existe, o servidor compara os bytes antes de considerar retry concluído.

RLS de Storage exige vínculo com o documento e permissão da organização. Download usa URL assinada de 60 segundos e registra solicitação de download. Os testes locais usam a tabela de objetos do harness para verificar RLS; entrega HTTP real do Storage publicado ainda não foi validada.

## Compra e financeiro

Na tela, vincule GoodsReceipt existente, SupplierDocument e AccountPayable quando disponíveis. Mapeie manualmente cada item para a linha do recebimento. `fiscal_reconcile` verifica organização, fornecedor, origem do título, quantidades, preço e total financeiro. Não cria entrada de estoque, documento de compra substituto ou título adicional.

A conferência registra pendência para autenticidade, tributos e frete. Não existe botão que transforme conferência comercial em autenticidade oficial. Parcelas, conversões de unidades e tolerâncias complexas ainda exigem evolução: a comparação atual é direta e conservadora.
