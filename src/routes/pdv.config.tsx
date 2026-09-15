import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useReceiptSettings, type ReceiptWidth, type ReceiptFont } from "@/lib/pdv-settings";
import { ReceiptPreview } from "@/components/receipt-preview";
import type { Sale } from "@/lib/pdv-store";

export const Route = createFileRoute("/pdv/config")({
  component: PdvConfig,
});

const sampleSale: Sale = {
  id: "PREVIEW",
  createdAt: new Date().toISOString(),
  lines: [
    {
      lineId: "s1",
      sku: "MLB-042-05",
      name: "Base Líquida Matte 30ml · Cor 05",
      lotId: "L2503",
      validity: "03/2027",
      qty: 1,
      unit: 89.9,
    },
    {
      lineId: "s2",
      sku: "BAT-LIQ-12",
      name: "Batom Líquido Long-Wear · Rouge",
      lotId: "L2601",
      validity: "11/2027",
      qty: 2,
      unit: 49.9,
    },
  ],
  payments: [
    { id: "p1", method: "pix", amount: 189.7, status: "paid", ref: "mp_demo" },
  ],
  cashbackUsed: 0,
  total: 189.7,
  customer: {
    name: "Aline Ribeiro",
    cpfMasked: "***.***.123-00",
    tier: "Ouro",
    cashback: 12.5,
  },
};

function PdvConfig() {
  const { settings, update, reset } = useReceiptSettings();
  const [showPreview, setShowPreview] = React.useState<Sale | null>(null);

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update({ logoDataUrl: reader.result as string });
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Configurações do cupom
          </h2>
          <p className="text-xs text-muted-foreground">
            Personalize logo, endereço, largura, fonte e rodapé por loja. As
            preferências ficam salvas neste dispositivo.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={reset}
            className="rounded-md border border-border bg-background px-3 py-2 text-xs"
          >
            Restaurar padrão
          </button>
          <button
            onClick={() => setShowPreview(sampleSale)}
            className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground"
          >
            👁 Pré-visualizar cupom
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Identificação */}
        <section className="space-y-4 rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold">Identificação da loja</h3>

          <Field label="Nome / razão social">
            <input
              value={settings.companyName}
              onChange={(e) => update({ companyName: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label="Endereço linha 1">
            <input
              value={settings.addressLine1}
              onChange={(e) => update({ addressLine1: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="Loja Vila Madalena · Caixa 02"
            />
          </Field>
          <Field label="Endereço linha 2">
            <input
              value={settings.addressLine2}
              onChange={(e) => update({ addressLine2: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="Rua, número, cidade/UF"
            />
          </Field>
          <Field label="CNPJ / IE">
            <input
              value={settings.cnpj}
              onChange={(e) => update({ cnpj: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="CNPJ 00.000.000/0001-00"
            />
          </Field>

          <Field label="Logotipo (PNG/JPG, opcional)">
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={handleLogo}
                className="text-xs"
              />
              {settings.logoDataUrl && (
                <>
                  <img
                    src={settings.logoDataUrl}
                    alt={settings.companyName ? `Logo da ${settings.companyName}` : "Logo da loja"}
                    className="h-10 rounded border border-border bg-background object-contain px-1"
                  />
                  <button
                    onClick={() => update({ logoDataUrl: null })}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Remover
                  </button>
                </>
              )}
            </div>
          </Field>
        </section>

        {/* Layout */}
        <section className="space-y-4 rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold">Layout de impressão</h3>

          <Field label="Largura do papel">
            <div className="flex gap-2">
              {[58, 80].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => update({ widthMm: w as ReceiptWidth })}
                  className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium ${
                    settings.widthMm === w
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  {w}mm
                </button>
              ))}
            </div>
          </Field>

          <Field label="Fonte">
            <div className="flex gap-2">
              {(
                [
                  { v: "helvetica", label: "Helvetica" },
                  { v: "courier", label: "Courier (monoespaçada)" },
                  { v: "times", label: "Times" },
                ] as const
              ).map((f) => (
                <button
                  key={f.v}
                  type="button"
                  onClick={() => update({ font: f.v as ReceiptFont })}
                  className={`flex-1 rounded-md border px-3 py-2 text-xs ${
                    settings.font === f.v
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground"
                  }`}
                  style={{ fontFamily: f.v }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Rodapé (até 3 linhas — use ↵ para quebrar)">
            <textarea
              value={settings.footer}
              onChange={(e) => update({ footer: e.target.value })}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none"
              placeholder="Obrigado pela preferência!"
            />
          </Field>

          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
            Dica: use 58mm para impressoras portáteis (bluetooth) e 80mm para
            impressoras fiscais/térmicas de balcão. A pré-visualização aplica
            todas as mudanças em tempo real.
          </div>
        </section>
      </div>

      <ReceiptPreview sale={showPreview} onClose={() => setShowPreview(null)} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
