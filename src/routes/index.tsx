import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const modules = [
    "PDV Omnichannel",
    "Estoque · Lote · Validade",
    "Compras & Fornecedores",
    "CRM 360°",
    "Fidelidade & Cashback",
    "Financeiro & Fluxo de Caixa",
    "WhatsApp Business",
    "Catálogo Digital",
    "E-commerce Integrado",
    "Shopee · Mercado Livre · TikTok Shop",
    "IA de Reposição & Recompra",
    "Multiempresa · Multilojas",
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
              KS
            </div>
            <span className="text-lg font-semibold tracking-tight">KS MultiMake</span>
          </div>
          <nav className="hidden gap-6 text-sm text-muted-foreground md:flex">
            <a href="#modulos" className="hover:text-foreground">
              Módulos
            </a>
            <a href="#plataforma" className="hover:text-foreground">
              Plataforma
            </a>
            <a href="#contato" className="hover:text-foreground">
              Contato
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Plataforma SaaS · Beleza, Cosméticos e Perfumaria
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-6xl">
            Adicionar um módulo para criar e editar posts no sistema com pré-visualização antes de publicar.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            ERP, PDV, CRM, financeiro, WhatsApp Business, e-commerce e marketplaces em uma única
            plataforma. Estoque unificado por lote e validade, cashback, fidelidade e IA de
            reposição inteligente.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#contato"
              className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Solicitar demonstração
            </a>
            <Link
              to="/pdv"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Entrar no sistema →
            </Link>
          </div>
        </section>

        <section id="modulos" className="border-t border-border bg-muted/30">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Os títulos da página inicial ainda não retornaram aos otiginais conforme solicitei
            </h2>
            <div className="mt-8 overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-3 px-4 font-semibold">Recurso</th>
                    <th className="py-3 px-4 font-semibold">WASeller (Referência)</th>
                    <th className="py-3 px-4 font-semibold text-primary">KS MultiMake (Atual)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="py-3 px-4 font-medium">Navegação</td>
                    <td className="py-3 px-4">Mobile-first / Bottom Bar</td>
                    <td className="py-3 px-4">Bottom Bar + Sidebar Adaptativa</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium">Inteligência Artificial</td>
                    <td className="py-3 px-4">Básica / Focada em Texto</td>
                    <td className="py-3 px-4">Bella IA, Fotos Marketing, Lote IA</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium">Canais de Venda</td>
                    <td className="py-3 px-4">WhatsApp</td>
                    <td className="py-3 px-4">WA, IG, FB, TikTok Shop, Marketplaces</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium">Infraestrutura</td>
                    <td className="py-3 px-4">SaaS Padrão</td>
                    <td className="py-3 px-4">TanStack Start + Supabase Realtime</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium">Gestão Fiscal</td>
                    <td className="py-3 px-4">Limitada</td>
                    <td className="py-3 px-4">NFe, SAT, SPED (100% Integrado)</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {modules.map((m) => (
                <div
                  key={m}
                  className="rounded-xl border border-border bg-card p-5 text-card-foreground transition-colors hover:border-primary/40"
                >
                  <div className="text-sm font-medium">{m}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="plataforma" className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-10 md:grid-cols-3">
            <div>
              <div className="text-3xl font-semibold">Omnichannel</div>
              <p className="mt-2 text-sm text-muted-foreground">
                PDV, WhatsApp, catálogo digital, e-commerce próprio, Shopee, Mercado Livre, TikTok
                Shop e Instagram Shopping com estoque unificado.
              </p>
            </div>
            <div>
              <div className="text-3xl font-semibold">Inteligente</div>
              <p className="mt-2 text-sm text-muted-foreground">
                IA para previsão de demanda, reposição automática e campanhas de recompra baseadas
                no ciclo de consumo do cliente.
              </p>
            </div>
            <div>
              <div className="text-3xl font-semibold">Multiempresa</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Multiloja, multiusuário, controle granular de permissões, metas e comissões por
                vendedor.
              </p>
            </div>
          </div>
        </section>

        <section id="contato" className="border-t border-border">
          <div className="mx-auto max-w-6xl px-6 py-20 text-center">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Pronto para transformar sua operação?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Fale com o time KS MultiMake e receba uma demonstração personalizada.
            </p>
            <a
              href="#"
              className="mt-8 inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Falar com um especialista
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-8 text-xs text-muted-foreground md:flex-row">
          <span>© {new Date().getFullYear()} KS MultiMake. Todos os direitos reservados.</span>
          <span>Gestão para lojas de maquiagem, cosméticos e perfumaria.</span>
        </div>
      </footer>
    </div>
  );
}
