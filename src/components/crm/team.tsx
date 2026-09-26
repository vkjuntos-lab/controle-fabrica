import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { actCrm, type CrmRow } from "@/lib/crm/crm.functions";
import { useOrganization } from "@/lib/org/org-context";
import { areas } from "./config";
import { asRowsFrom, useCrmQuery } from "./data";
import { CrmListPage } from "./list";
import { Picker, ResultState, StatusBadge, str } from "./shared";

/**
 * Representantes.
 *
 * A lista é declarativa. A diferença real está na carteira: representante
 * interno, externo ou da própria empresa muda o que a operação pode esperar dele,
 * e isso é atributo do cadastro, não uma coluna calculada na tela.
 */
export function RepresentativesPage() {
  return (
    <CrmListPage
      area={areas.representantes}
      title="Comercial · Representantes"
      intro="Quem negocia pela organização. Um representante pode ser interno, externo ou a própria empresa comercial, e o tipo é gravado no cadastro porque muda a regra de carteira."
    />
  );
}

const portfolioArea = areas.carteiras;

/**
 * Carteiras.
 *
 * A atribuição é `crm_action('portfolio','assign')` e não um INSERT: encerrar a
 * carteira anterior e abrir a nova acontece na mesma transação, com motivo
 * obrigatório, e o histórico permanece. Por isso esta tela não usa o formulário
 * declarativo — a escrita de carteira não é um `crm_save`.
 */
export function PortfoliosPage() {
  return (
    <CrmListPage
      area={portfolioArea}
      title="Comercial · Carteiras"
      intro="Cada cliente tem uma carteira ativa. A transferência encerra a anterior, abre a nova com motivo e não reescreve o responsável de negociações já existentes."
      extraActions={<AssignPortfolioButton />}
    />
  );
}

/** Atribuição de carteira, com a lista de clientes do representante. */
export function AssignPortfolioButton() {
  const { currentOrganization, hasPermission } = useOrganization();
  const [open, setOpen] = useState(false);
  if (!hasPermission("portfolios.manage")) return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}>Atribuir carteira</Button>
      {open && currentOrganization ? (
        <AssignDialog
          org={currentOrganization.organization_id}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function AssignDialog({ org, onClose }: { org: string; onClose: () => void }) {
  const api = useServerFn(actCrm);
  const client = useQueryClient();
  const [companyId, setCompanyId] = useState("");
  const [representativeId, setRepresentativeId] = useState("");
  const [reason, setReason] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());

  const assign = useMutation({
    mutationFn: async () => {
      await api({
        data: {
          organizationId: org,
          kind: "portfolio",
          id: companyId,
          action: "assign",
          values: { representative_id: representativeId, reason },
          key,
        },
      });
    },
    onSuccess: () => {
      toast.success("Carteira atribuída.");
      onClose();
      void client.invalidateQueries({ queryKey: ["crm"] });
    },
    onError: (error: Error) => {
      setKey(crypto.randomUUID());
      toast.error(error.message);
    },
  });

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Atribuir carteira</DialogTitle>
          <DialogDescription>
            A carteira ativa anterior é encerrada na mesma transação e permanece no histórico. O
            motivo é obrigatório, e apenas representantes ativos aceitam carteira.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Picker org={org} kind="companies" value={companyId} onChange={setCompanyId} label="Cliente" />
          <Picker
            org={org}
            kind="representatives"
            value={representativeId}
            onChange={setRepresentativeId}
            label="Representante"
          />
          <div className="space-y-1 sm:col-span-2">
            <label className="text-sm" htmlFor="portfolio-reason">
              Motivo
            </label>
            <input
              id="portfolio-reason"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={assign.isPending || !companyId || !representativeId || !reason.trim()}
            onClick={() => assign.mutate()}
          >
            {assign.isPending ? "Atribuindo..." : "Atribuir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Carteira de um representante: clientes ativos e histórico de transferências.
 * O histórico vem da mesma tabela de atribuições, filtrada por representante — não
 * de uma coluna denormalizada que o servidor teria de manter.
 */
export function RepresentativePortfolioPage({ id }: { id: string }) {
  const { currentOrganization, hasPermission } = useOrganization();
  const rows = useCrmQuery(currentOrganization?.organization_id ?? "", "portfolios", {}, 1);
  const companies = useCrmQuery(currentOrganization?.organization_id ?? "", "companies", {}, 1);
  const assignments = asRowsFrom(rows.data).filter(
    (row) => String(row.representative_id) === id,
  );
  const name = (row: CrmRow) => str(row.name ?? row.legal_name ?? row.id);
  const companyName = new Map(
    asRowsFrom(companies.data).map((row) => [row.id, name(row)]),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-xl font-semibold">Carteira do representante</h2>
        {hasPermission("portfolios.manage") ? <AssignPortfolioButton /> : null}
      </div>

      <ResultState loading={rows.isLoading} error={rows.error} empty={!assignments.length}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-2 pt-6">
              <h3 className="font-heading text-base font-semibold">Clientes ativos</h3>
              <ul className="space-y-1 text-sm">
                {assignments
                  .filter((row) => !row.ended_at)
                  .map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-3 border-b py-1">
                      <a
                        href={`/comercial/clientes/${String(row.company_id)}`}
                        className="hover:underline"
                      >
                        {companyName.get(String(row.company_id)) ?? str(row.company_id)}
                      </a>
                      <span className="text-xs text-muted-foreground">
                        desde {str(row.started_at)}
                      </span>
                    </li>
                  ))}
                {!assignments.filter((row) => !row.ended_at).length ? (
                  <li className="text-muted-foreground">Nenhum cliente ativo.</li>
                ) : null}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2 pt-6">
              <h3 className="font-heading text-base font-semibold">Histórico</h3>
              <ul className="space-y-1 text-sm">
                {assignments.map((row) => (
                  <li key={row.id} className="space-y-0.5 border-b py-1">
                    <div className="flex items-center justify-between gap-3">
                      <span>{companyName.get(String(row.company_id)) ?? str(row.company_id)}</span>
                      {row.ended_at ? (
                        <StatusBadge value="HISTORICO" kind="status" />
                      ) : (
                        <StatusBadge value="ACTIVE" kind="status" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {str(row.started_at)}
                      {row.ended_at ? ` → ${str(row.ended_at)}` : ""}
                      {row.reason ? ` · ${str(row.reason)}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </ResultState>

      <p className="text-xs text-muted-foreground">
        A negociação já registrada mantém o representante que estava na carteira quando foi criada.
        O responsável exibido reflete o estado atual da carteira, não o passado da negociação.
      </p>
    </div>
  );
}
