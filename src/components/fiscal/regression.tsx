import { useState } from "react";
import { Button } from "@/components/ui/button";
import { mutateFiscal } from "@/lib/fiscal/fiscal.functions";
export function Regression({
  org,
  rule,
  onPassed,
}: {
  org: string;
  rule: string;
  onPassed: (id: string) => void;
}) {
  const [cases, setCases] = useState(
    Array.from({ length: 3 }, () => ({
      on_date: "",
      quantity: "",
      unit_price: "",
      expected_total: "",
      expected_applicable: false,
    })),
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3 rounded border p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const result = await mutateFiscal({
            data: { organizationId: org, operation: "test_rule", id: rule, values: { cases } },
          });
          if (result && typeof result === "object" && !Array.isArray(result) && result.passed) {
            onPassed(String(result.id));
            setMessage("Regressão aprovada no servidor. Referência preenchida para ativação.");
          } else setMessage("Regressão reprovada: os valores esperados diferem dos calculados.");
        } catch (err) {
          setMessage(err instanceof Error ? err.message : "Falha no teste");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="font-semibold">Regressão antes da ativação</h3>
      <p className="text-sm">
        Informe parâmetros de teste e resultados esperados aprovados pelo responsável fiscal: antes
        da vigência, no início e após o fim (ou após o início para vigência aberta).
      </p>
      {cases.map((c, index) => (
        <fieldset key={index} className="flex flex-wrap gap-2">
          <legend className="text-sm">Cenário {index + 1}</legend>
          {(
            [
              ["on_date", "Data"],
              ["quantity", "Quantidade"],
              ["unit_price", "Preço"],
              ["expected_total", "Total de tributos esperado"],
            ] as const
          ).map(([key, title]) => (
            <label key={key} className="grid text-sm">
              {title}
              <input
                className="w-40 rounded border bg-background p-2"
                required
                type={key === "on_date" ? "date" : "number"}
                min={key === "on_date" ? undefined : "0"}
                step="any"
                value={c[key]}
                onChange={(e) =>
                  setCases(cases.map((r, n) => (n === index ? { ...r, [key]: e.target.value } : r)))
                }
              />
            </label>
          ))}
          <label className="self-end p-2 text-sm">
            <input
              type="checkbox"
              checked={c.expected_applicable}
              onChange={(e) =>
                setCases(
                  cases.map((r, n) =>
                    n === index ? { ...r, expected_applicable: e.target.checked } : r,
                  ),
                )
              }
            />{" "}
            Regra aplicável nesta data
          </label>
        </fieldset>
      ))}
      <Button disabled={busy}>Executar regressão</Button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
