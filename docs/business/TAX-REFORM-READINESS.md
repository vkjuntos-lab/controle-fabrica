# Preparação para a Reforma Tributária do Consumo

Estado: **PARTIAL**. Há estrutura extensível e controles de mudança; não há certificação de conformidade RTC nem apuração definitiva.

`fiscal_taxes` admite códigos configurados de IBS, CBS e Imposto Seletivo, sem criar alíquotas padrão. `additional_classification`, `reform_fields`, versões de leiaute, fonte, publicação, vigência, implantação e homologação preservam a evolução técnica. Regras e capturas guardam versão e origem dos parâmetros.

Não existe tabela de percentuais por ano nem atualização automática a partir de textos da internet. Responsável fiscal precisa validar a obrigação por modelo, operação, contribuinte e período. A regressão local cobre fronteiras de vigência e aritmética; não substitui os testes do pacote XML oficial e do provedor.

## Fontes técnicas consultadas em 29/09/2026

- [Portal NF-e — MOC 7.0 e documentação](https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=ndIjl+iEFdE%3D).
- [MOC 7.0, Anexo I — leiaute NF-e/NFC-e](https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=J+I+v4eN00E%3D).
- [Portal NF-e — Notas Técnicas, incluindo NT 2025.002 RTC](https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=04BIflQt1aY%3D).
- [Portal NF-e — pacotes oficiais de schemas](https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=BMPFMBoln3w%3D).

Essas fontes foram usadas para delimitar o escopo e a necessidade de controle de versões. Nenhum pacote XSD RTC foi incorporado ou declarado homologado nesta entrega. O parser local tem versão 1 e reconhece estrutura básica `nfeProc` 4.00; isso **não** comprova compatibilidade com toda revisão de NT. As fixtures usam códigos e percentuais de teste, sem recomendação tributária.

Antes de produção: selecionar pacote técnico e provedor, registrar hashes/versões dos artefatos, homologar schema/assinatura/validações e cenários aprovados pelo responsável, revisar fórmulas regionais/complexas, depois ativar o adaptador. NFS-e e NFC-e permanecem fora da operação fiscal atual.
