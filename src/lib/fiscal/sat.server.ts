// Provider SAT-CF-e (SP) — stub que fala com equipamento SAT local via HTTP.
// Em produção o cliente configura IP:porta do daemon SAT (ex.: MFe/SATdll wrapper).
import type { FiscalProvider, EmitInput, EmitResult, CancelInput, CancelResult } from "./types";

export function makeSatProvider(satHost?: string | null): FiscalProvider {
  return {
    name: "sat",
    async emitNFCe(input: EmitInput): Promise<EmitResult> {
      if (!satHost) return { status: "contingency", error: "SAT não configurado" };
      try {
        const r = await fetch(`${satHost}/cfe/emit`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const j: any = await r.json();
        if (!r.ok) return { status: "rejected", error: j?.mensagem ?? "SAT rejeitou" };
        return { status: "authorized", chave: j.chave, protocolo: j.protocolo, xml: j.xml };
      } catch (e: any) {
        return { status: "contingency", error: e?.message ?? "SAT offline" };
      }
    },
    async emitNFe() { return { status: "rejected", error: "SAT não emite NF-e" }; },
    async cancelDoc(_input: CancelInput): Promise<CancelResult> {
      return { status: "rejected", error: "Cancelamento SAT via equipamento físico" };
    },
    async queryStatus() {
      if (!satHost) return { online: false, message: "sem SAT" };
      try { const r = await fetch(`${satHost}/status`); return { online: r.ok }; }
      catch { return { online: false, message: "SAT offline" }; }
    },
  };
}
