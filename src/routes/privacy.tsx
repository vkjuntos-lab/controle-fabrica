import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Política de Privacidade — KS MultiMake" },
      { name: "description", content: "Política de Privacidade da plataforma KS MultiMake. Saiba como coletamos, usamos e protegemos seus dados." },
      { property: "og:title", content: "Política de Privacidade — KS MultiMake" },
      { property: "og:description", content: "Política de Privacidade da plataforma KS MultiMake." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link to="/" className="text-lg font-semibold tracking-tight hover:text-primary">
            KS MultiMake
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Política de Privacidade</h1>
        <p className="mt-2 text-sm text-muted-foreground">Última atualização: {new Date().toLocaleDateString("pt-BR")}</p>

        <section className="mt-8 space-y-6 text-sm leading-7 text-muted-foreground">
          <p>
            A KS MultiMake respeita sua privacidade e está comprometida em proteger os dados pessoais
            dos usuários de sua plataforma. Esta política descreve como coletamos, usamos, armazenamos
            e compartilhamos suas informações.
          </p>

          <div>
            <h2 className="text-lg font-semibold text-foreground">1. Dados que coletamos</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Informações de cadastro da loja (nome, CNPJ/CPF, e-mail, telefone).</li>
              <li>Dados de clientes finais fornecidos durante atendimentos e compras.</li>
              <li>Mensagens e interações dos canais conectados (WhatsApp, Instagram, Facebook Messenger).</li>
              <li>Dados técnicos de navegação e uso da plataforma.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">2. Como usamos os dados</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Operar o PDV, estoque, financeiro e demais módulos do sistema.</li>
              <li>Realizar atendimento omnichannel integrado aos canais de mensagem.</li>
              <li>Emitir notificações, relatórios e melhorar a experiência do usuário.</li>
              <li>Cumprir obrigações legais e regulatórias.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">3. Compartilhamento de dados</h2>
            <p>
              Não vendemos dados pessoais. Compartilhamos informações apenas com provedores de serviço
              essenciais (hospedagem, processamento de pagamento, envio de mensagens) e quando exigido
              por lei. Os dados de canais sociais são tratados de acordo com as políticas da Meta e do WhatsApp.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">4. Segurança</h2>
            <p>
              Adotamos medidas técnicas e administrativas para proteger seus dados, incluindo criptografia,
              controle de acesso baseado em funções (RBAC), logs de auditoria e monitoramento contínuo.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">5. Seus direitos</h2>
            <p>
              Você pode solicitar acesso, correção ou exclusão de seus dados a qualquer momento entrando
              em contato pelo e-mail <strong>privacidade@estrategia.app</strong> ou usando o canal
              de exclusão de dados indicado no painel do app.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">6. Exclusão de dados</h2>
            <p>
              Para solicitar a exclusão completa dos dados da sua loja e dos seus clientes, envie um e-mail
              para <strong>privacidade@estrategia.app</strong> com o assunto "Solicitação de exclusão de dados".
              A exclusão será processada em até 30 dias, conforme a legislação aplicável.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">7. Alterações nesta política</h2>
            <p>
              Podemos atualizar esta política periodicamente. Recomendamos que você a revise sempre que
              acessar a plataforma. Alterações significativas serão comunicadas por e-mail ou dentro do app.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">8. Contato</h2>
            <p>
              Dúvidas sobre esta política podem ser enviadas para{" "}
              <strong>privacidade@estrategia.app</strong>.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-3xl px-6 py-8 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} KS MultiMake. Todos os direitos reservados.
        </div>
      </footer>
    </div>
  );
}
