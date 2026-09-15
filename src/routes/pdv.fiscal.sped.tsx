import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import * as React from "react";
import { exportSpedFiscal } from "@/lib/pdv-fiscal.functions";

export const Route = createFileRoute("/pdv/fiscal/sped")({ component: SpedPage });

function SpedPage() {
  const now = new Date();
  const [month, setMonth] = React.useState(`${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`);
  const fn = useServerFn(exportSpedFiscal);
  const mut = useMutation({
    mutationFn: () => fn({ data: { month } }),
    onSuccess: (r) => {
      const blob = new Blob([r.content], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = r.filename; a.click();
    },
  });

  return (
    <div className="space-y-6 max-w-xl">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">SPED Fiscal</h2>
        <p className="text-xs text-muted-foreground">Exporta bloco 0/C do SPED ICMS/IPI do mês. Validar no PVA.</p>
      </header>
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <label className="text-xs space-y-1 block">
          <span className="text-muted-foreground">Mês (YYYY-MM)</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5" />
        </label>
        <button onClick={() => mut.mutate()} disabled={mut.isPending}
          className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground">
          {mut.isPending ? "Gerando..." : "Gerar e baixar SPED"}
        </button>
        {mut.data && <div className="text-xs text-muted-foreground">{mut.data.count} documentos exportados.</div>}
      </div>
    </div>
  );
}
