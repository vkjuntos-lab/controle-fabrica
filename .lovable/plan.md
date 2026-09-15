# Cópia do KSMakeup para este projeto, com o nome "Estratégia"

## O que vai ser feito

1. **Copiar o sistema inteiro** do KSMakeup para este projeto: todas as telas (PDV, caixa, produtos, clientes, CRM, financeiro, fiscal, loja online, marketing/IA), componentes, estilos e a lógica de servidor.
2. **Ativar o Lovable Cloud** neste projeto e recriar toda a estrutura do banco de dados e de login do zero — mesma estrutura, **sem nenhum dado** (nada de produtos, clientes ou vendas antigas).
3. **Trocar o nome** de KSMakeup para **Estratégia** em tudo que aparece para o usuário: título do site, textos de apresentação, menu lateral, loja online, páginas de privacidade e arquivos de busca do Google.
4. **Verificar** que o sistema abre, que a tela inicial e as principais telas carregam, que dá para criar uma conta e entrar, e que um cadastro simples (produto/cliente) grava e aparece.
5. **Aguardar seus próximos comandos** para as demais modificações.

## Pontos importantes

- Os dados atuais do KSMakeup não vêm — a cópia começa vazia, como você pediu.
- Você precisará criar um novo login nesta cópia; as contas do projeto original não são transferidas.
- Chaves de serviços externos (pagamentos, WhatsApp/Instagram, envio de e-mail, etc.) não são copiadas. Se você quiser essas partes funcionando, eu peço as chaves depois, de forma segura.
- Uma imagem que está guardada no projeto original pode não vir junto; se isso acontecer eu aviso e coloco uma imagem provisória.

## Detalhes técnicos

- Origem: snapshot somente-leitura do projeto KSMakeup (411 arquivos, 85 migrações).
- Copiar `src/` (routes, components, hooks, lib, utils, assets, styles.css, router/start/server), `public/`, `supabase/`, configs (`vite.config.ts`, `tsconfig.json`, `components.json`, `eslint.config.js`) e as dependências do `package.json` (instalação via bun).
- Habilitar Lovable Cloud, então aplicar as 85 migrações em ordem (tabelas + GRANTs + RLS + funções), sem INSERTs de dados.
- Manter os arquivos gerados pela integração (`src/integrations/supabase/*`) na versão deste projeto quando houver conflito de chaves/URL; substituir `types.ts` pela versão regenerada.
- Rotas de API públicas em `src/routes/api/public/*` permanecem, com a verificação de assinatura já existente.
- Substituir as ocorrências de "KSMakeup" nos 10 arquivos identificados, incluindo `head()` de cada rota (título, descrição, og/twitter).
