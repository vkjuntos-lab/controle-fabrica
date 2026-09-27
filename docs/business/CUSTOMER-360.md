# Customer 360
A rota /comercial/clientes/<company_id> oferece a perspectiva comercial da mesma Company usada por Parceiros e Compras. Não existe nova empresa porque alguém também é fornecedor ou parceiro.

CustomerProfile guarda código, tipo, status comercial, origem, segmento, tabela, condição e notas. Histórico de compra e primeira/última compra não são inventados: dependem de transações futuras de venda.

Contatos reutilizam CompanyContact; criação/edição passa pelo mesmo núcleo de cadastro do domínio empresarial, preservando campos omitidos. Inativação não remove fatos históricos.

Abas: visão geral, contatos, oportunidades, propostas, atividades, histórico, financeiro e documentos. Linha do tempo consulta contatos, leads convertidos, oportunidades, propostas, atividades, recebíveis e recebimentos reais, com referência à origem. Cada fonte respeita suas permissões; financeiro exige commercial_sensitive.read e receivables.read. Reconciliações, ocorrências e pedidos ainda não integram essa linha do tempo.

Documentos: PDF/JPEG/PNG até 10 MB, finalidade obrigatória, bucket crm-documents privado, caminho organização/empresa/UUID. Upload passa por preparação autorizada e confirmação de metadados; download usa URL assinada de 60 segundos. Não há URL pública ou overwrite de anexo consolidado. Entrega real de objetos depende do Storage publicado e não foi validada localmente.

A timeline e documentos possuem paginação de 50. Outras abas do 360 ainda mostram a primeira página; as listagens gerais oferecem paginação. Mesclagem é solicitação para revisão, não migração automática de todos os relacionamentos.
