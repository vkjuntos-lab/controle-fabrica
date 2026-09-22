# ADR-006 — Remessa direta ao parceiro e núcleo único do ledger

Status: implementado no código; validação local. Implantação pendente.

## Contexto

O checkout oferece InventoryLocation, ledger imutável, transferências atômicas e lock por organização.
Não possui MarketplaceStore/MASTER 005. Remessa representa posse operacional, sem reconhecer venda.

## Decisão

1. Company possui múltiplos papéis e PartnerProfile representa sua operação de parceiro.
2. InventoryLocation.partner_id aponta PartnerProfile. Nenhuma tabela de saldo de parceiro.
3. SHIPPED transfere diretamente origem → parceiro; DELIVERED apenas confirma recebimento.
4. O corpo existente da transferência foi movido para função privada compartilhada. Wrappers de
   estoque e de parceiro aplicam suas permissões/estados antes do mesmo escritor/guard de ledger.
5. Documentos têm transfer_id; ledger mantém referência à transferência. Retry retorna a operação
   existente. A organização usa o mesmo lock transacional dos demais escritores de estoque.
6. Correção física usa novo documento; estorno genérico do ledger não pode invalidar documento de
   parceiro consolidado. Dados comerciais, movimentos e devoluções recebidas são preservados.
7. Relacionamento MarketplaceStore aguarda o módulo existente, sem tabela substituta nesta etapa.

## Consequências

Posição operacional de parceiro inclui expedição ainda não confirmada como entregue. Trânsito com
recebimento em duas etapas exigirá evolução explícita de estados/referências, sem reinterpretar fatos
históricos. Locks por organização priorizam integridade; um lock mais granular exige ordem global
compatível com todos os domínios antes de ser adotado. A propriedade econômica não muda pela localização.

Foi necessário corrigir o encaixe das rotas de detalhe de movimentação/contagem existentes: as rotas
filhas estavam sob listagens sem Outlet. O ajuste preserva URLs e permite a integração do Parceiro 360.
