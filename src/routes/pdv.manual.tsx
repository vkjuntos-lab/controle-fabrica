import { createFileRoute } from "@tanstack/react-router";
import { Download, ExternalLink, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/pdv/manual")({
  head: () => ({
    meta: [
      { title: "Manual do sistema — PDV KS MultiMake" },
      {
        name: "description",
        content:
          "Manual completo de funcionalidades, rotas, permissões e fluxos operacionais do PDV KS MultiMake.",
      },
    ],
  }),
  component: ManualPage,
});

const PDF_URL = "/manual-pdv.pdf";
const TECH_PDF_URL = "/manual-tecnico.pdf";

const SECTIONS = [
  { n: 1, title: "Visão geral da plataforma" },
  { n: 2, title: "Primeiros passos e login" },
  { n: 3, title: "Autenticação e permissões" },
  { n: 4, title: "Estrutura de menu e navegação" },
  { n: 5, title: "Operação — PDV, Caixa e Vendas" },
  { n: 6, title: "Catálogo — Produtos e Estoque" },
  { n: 7, title: "Clientes e CRM 360°" },
  { n: 8, title: "Financeiro — DRE e Fluxo" },
  { n: 9, title: "Recebimentos — PIX, Boletos, Assinaturas" },
  { n: 10, title: "Fiscal — NF-e, NFC-e, SPED" },
  { n: 11, title: "Fidelidade, Cupons, Vales, Crediário" },
  { n: 12, title: "CRM — Campanhas" },
  { n: 13, title: "WhatsApp, Instagram e Bella IA" },
  { n: 14, title: "Vitrine e Marketplaces" },
  { n: 15, title: "BI, Relatórios e Auditoria" },
  { n: 16, title: "Antifraude e Notificações" },
  { n: 17, title: "Configurações e Multiloja" },
  { n: 18, title: "Fluxos operacionais ponta-a-ponta" },
  { n: 19, title: "PWA, Offline e IA embutida" },
  { n: 20, title: "Suporte, boas práticas e FAQ" },
];

function ManualPage() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <BookOpen className="h-6 w-6" />
            Manual do sistema
          </h1>
          <p className="text-sm text-muted-foreground">
            Documentação completa de funcionalidades, rotas, permissões e fluxos
            operacionais do PDV KS MultiMake.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={PDF_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir manual do usuário
            </a>
          </Button>
          <Button asChild>
            <a href={PDF_URL} download="manual-pdv-ks-multimake.pdf">
              <Download className="mr-2 h-4 w-4" />
              Baixar manual do usuário
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={TECH_PDF_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir manual técnico
            </a>
          </Button>
          <Button asChild variant="secondary">
            <a href={TECH_PDF_URL} download="manual-tecnico-pdv-ks-multimake.pdf">
              <Download className="mr-2 h-4 w-4" />
              Baixar manual técnico
            </a>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b py-3">
            <CardTitle className="text-sm font-medium">
              Visualização — manual-pdv.pdf
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <iframe
              src={`${PDF_URL}#view=FitH`}
              title="Manual PDV KS MultiMake"
              className="h-[75vh] w-full border-0"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Sumário</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {SECTIONS.map((s) => (
              <div
                key={s.n}
                className="flex items-baseline gap-2 py-1 text-muted-foreground"
              >
                <span className="w-6 shrink-0 text-right font-mono text-xs">
                  {s.n}.
                </span>
                <span>{s.title}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
