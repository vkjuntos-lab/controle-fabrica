import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/org/org-context";
import {
  prepareCrmDocument,
  finishCrmDocument,
  downloadCrmDocument,
} from "@/lib/crm/crm.functions";
import { useCrmQuery } from "./data";
import { ResultState, str } from "./shared";

export function CustomerDocuments({ org, companyId }: { org: string; companyId: string }) {
  const { hasPermission } = useOrganization();
  const cache = useQueryClient();
  const prepare = useServerFn(prepareCrmDocument),
    finish = useServerFn(finishCrmDocument),
    download = useServerFn(downloadCrmDocument);
  const [file, setFile] = useState<File | null>(null),
    [purpose, setPurpose] = useState(""),
    [page, setPage] = useState(1);
  const list = useCrmQuery(org, "documents", { company_id: companyId }, page);
  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !purpose.trim()) throw new Error("Selecione o arquivo e informe a finalidade.");
      if (
        !["application/pdf", "image/jpeg", "image/png"].includes(file.type) ||
        file.size > 10485760
      )
        throw new Error("Use PDF, JPEG ou PNG de até 10 MB.");
      const doc = await prepare({
        data: {
          organizationId: org,
          companyId,
          key: crypto.randomUUID(),
          name: file.name,
          mimeType: file.type as "application/pdf" | "image/jpeg" | "image/png",
          size: file.size,
          purpose,
        },
      });
      const { error } = await supabase.storage
        .from("crm-documents")
        .upload(String(doc.storage_path), file, { contentType: file.type, upsert: false });
      if (error) throw error;
      await finish({ data: { organizationId: org, id: doc.id } });
    },
    onSuccess: () => {
      toast.success("Documento armazenado com acesso privado.");
      setFile(null);
      setPurpose("");
      void cache.invalidateQueries({ queryKey: ["crm", org, "documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const open = useMutation({
    mutationFn: (id: string) => download({ data: { organizationId: org, id } }),
    onSuccess: (url) => {
      window.location.assign(url);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-4">
      {hasPermission("customers.update") && (
        <form
          className="space-y-3 rounded border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            upload.mutate();
          }}
        >
          <label className="block text-sm">
            Documento (PDF, JPEG ou PNG; até 10 MB)
            <Input
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          <label className="block text-sm">
            Finalidade
            <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} required />
          </label>
          <Button disabled={upload.isPending || !file}>
            {upload.isPending ? "Enviando…" : "Anexar documento privado"}
          </Button>
        </form>
      )}
      <ResultState loading={list.isLoading} error={list.error} empty={!list.data?.rows?.length}>
        <div className="space-y-2">
          {list.data?.rows?.map((row) => (
            <div className="flex flex-wrap justify-between gap-3 rounded border p-3" key={row.id}>
              <div>
                <strong>{str(row.name)}</strong>
                <p className="text-sm text-muted-foreground">
                  {str(row.purpose)} · {str(row.created_at)}
                </p>
              </div>
              <Button
                variant="outline"
                disabled={open.isPending}
                onClick={() => open.mutate(row.id)}
              >
                Baixar
              </Button>
            </div>
          ))}
        </div>
      </ResultState>
      {(list.data?.total || 0) > 50 && (
        <div className="flex gap-3">
          <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
            Anterior
          </Button>
          <Button disabled={page * 50 >= (list.data?.total || 0)} onClick={() => setPage(page + 1)}>
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}
