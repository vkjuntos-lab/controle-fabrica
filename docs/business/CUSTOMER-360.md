# Customer 360
A rota /comercial/clientes/<company_id> oferece a perspectiva comercial da mesma Company usada por Parceiros e Compras. Não existe nova empresa porque alguém também é fornecedor ou parceiro.

CustomerProfile guarda código, tipo, status comercial, origem, segmento, tabela, condição e notas. Histórico de compra e primeira/última compra não são inventados: dependem de transações futuras de venda.

Contatos reutilizam CompanyContact; criação/edição passa pelo mesmo núcleo de cadastro do domínio empresarial, preservando campos omitidos. Inativação não remove fatos históricos.

Abas: visão geral, contatos, oportunidades, propostas, atividades, histórico, financeiro e documentos. Linha do tempo consulta contatos, leads convertidos, oportunidades, propostas, atividades, recebíveis e recebimentos reais, com referência à origem. Cada fonte respeita suas permissões; financeiro exige commercial_sensitive.read e receivables.read. Reconciliações integram a timeline somente com reconciliation.read e commercial_sensitive.read. Recebimentos estornados são identificados como estorno. Pedidos futuros e um módulo específico de ocorrências não são inventados.

Documentos: PDF/JPEG/PNG até 10 MB, finalidade obrigatória, bucket crm-documents privado, caminho organização/empresa/UUID. Upload passa por preparação autorizada e confirmação de metadados; download usa URL assinada de 60 segundos. Não há URL pública ou overwrite de anexo consolidado. Entrega real de objetos depende do Storage publicado e não foi validada localmente.

Contatos, oportunidades, propostas, atividades, carteira, timeline e documentos possuem paginação de 50. Trocar de cliente reinicia as páginas. Oportunidades e propostas têm links para os detalhes de origem. Mesclagem é solicitação para revisão, não migração automática de todos os relacionamentos.
