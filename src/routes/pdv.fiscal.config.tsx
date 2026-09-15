import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import {
  getFiscalSettings, upsertFiscalSettings,
  listTaxProfiles, saveTaxProfile, deleteTaxProfile,
  querySefazStatus, setFiscalCertRef,
} from "@/lib/pdv-fiscal.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/pdv/fiscal/config")({ component: FiscalConfigPage });

function FiscalConfigPage() {
  const [tab, setTab] = React.useState<"emitter" | "cert" | "profiles" | "status">("emitter");
  const qc = useQueryClient();
  const getFn = useServerFn(getFiscalSettings);
  const upFn = useServerFn(upsertFiscalSettings);
  const listFn = useServerFn(listTaxProfiles);
  const saveFn = useServerFn(saveTaxProfile);
  const delFn = useServerFn(deleteTaxProfile);
  const stFn = useServerFn(querySefazStatus);

  const { data: cfg } = useQuery({ queryKey: ["fiscal-cfg"], queryFn: () => getFn({ data: {} }) });
  const { data: profiles } = useQuery({ queryKey: ["fiscal-profiles"], queryFn: () => listFn() });
  const { data: sefaz } = useQuery({ queryKey: ["fiscal-sefaz"], queryFn: () => stFn({ data: {} }), enabled: tab === "status", refetchInterval: 30_000 });

  const saveCfg = useMutation({
    mutationFn: (d: any) => upFn({ data: d }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fiscal-cfg"] }),
  });
  const saveProf = useMutation({
    mutationFn: (d: any) => saveFn({ data: d }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fiscal-profiles"] }),
  });
  const delProf = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fiscal-profiles"] }),
  });

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Configuração Fiscal</h2>
        <p className="text-xs text-muted-foreground">Emissor, perfis tributários e status SEFAZ.</p>
      </header>

      <div className="flex gap-2 border-b border-border">
        {(["emitter", "cert", "profiles", "status"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
            {t === "emitter" ? "Emitente" : t === "cert" ? "Certificado A1" : t === "profiles" ? "Perfis tributários" : "Status SEFAZ"}
          </button>
        ))}
      </div>

      {tab === "cert" && <CertificateSection settings={cfg?.settings} />}


      {tab === "emitter" && (
        <form onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const payload: any = { id: cfg?.settings?.id };
          for (const [k, v] of f.entries()) payload[k] = typeof v === "string" ? v : v;
          ["nfce_serie", "nfce_next_number", "nfe_serie", "nfe_next_number"].forEach(k => payload[k] = Number(payload[k] || 1));
          saveCfg.mutate(payload);
        }} className="grid gap-3 md:grid-cols-3 rounded-xl border border-border bg-card p-4">
          <Field name="cnpj" label="CNPJ" def={cfg?.settings?.cnpj} />
          <Field name="razao_social" label="Razão social" def={cfg?.settings?.razao_social} />
          <Field name="nome_fantasia" label="Nome fantasia" def={cfg?.settings?.nome_fantasia} />
          <Field name="ie" label="IE" def={cfg?.settings?.ie} />
          <Field name="im" label="IM" def={cfg?.settings?.im} />
          <Field name="cnae" label="CNAE" def={cfg?.settings?.cnae} />
          <Field name="uf" label="UF" def={cfg?.settings?.uf} />
          <Field name="municipio" label="Município" def={cfg?.settings?.municipio} />
          <Field name="cep" label="CEP" def={cfg?.settings?.cep} />
          <Field name="endereco" label="Endereço" def={cfg?.settings?.endereco} />
          <Select name="regime" label="Regime" def={cfg?.settings?.regime ?? "simples"}
            options={["simples", "presumido", "real", "mei"]} />
          <Select name="environment" label="Ambiente" def={cfg?.settings?.environment ?? "homologacao"}
            options={["homologacao", "producao"]} />
          <Select name="provider" label="Provider" def={cfg?.settings?.provider ?? "focus"}
            options={["focus", "sat"]} />
          <Field name="nfce_serie" label="Série NFC-e" type="number" def={cfg?.settings?.nfce_serie ?? 1} />
          <Field name="nfce_next_number" label="Próximo nº NFC-e" type="number" def={cfg?.settings?.nfce_next_number ?? 1} />
          <Field name="nfe_serie" label="Série NF-e" type="number" def={cfg?.settings?.nfe_serie ?? 1} />
          <Field name="nfe_next_number" label="Próximo nº NF-e" type="number" def={cfg?.settings?.nfe_next_number ?? 1} />
          <Field name="csc_id" label="CSC ID (NFC-e)" def={cfg?.settings?.csc_id} />
          <Field name="csc_token" label="CSC Token (NFC-e)" def={cfg?.settings?.csc_token} />
          <div className="md:col-span-3 flex justify-end">
            <button type="submit" disabled={saveCfg.isPending}
              className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground">
              {saveCfg.isPending ? "Salvando..." : "Salvar emitente"}
            </button>
          </div>
        </form>
      )}

      {tab === "profiles" && (
        <div className="space-y-4">
          <ProfileForm onSave={(d) => saveProf.mutate(d)} />
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 uppercase text-[10px] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Nome</th>
                  <th className="px-3 py-2">CFOP</th>
                  <th className="px-3 py-2">CSOSN/CST</th>
                  <th className="px-3 py-2 text-right">ICMS %</th>
                  <th className="px-3 py-2 text-right">PIS %</th>
                  <th className="px-3 py-2 text-right">COFINS %</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {profiles?.rows.map((p: any) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-3 py-2">{p.name}</td>
                    <td className="px-3 py-2 text-center">{p.cfop}</td>
                    <td className="px-3 py-2 text-center">{p.csosn ?? p.cst_icms ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{p.icms_aliq}</td>
                    <td className="px-3 py-2 text-right">{p.pis_aliq}</td>
                    <td className="px-3 py-2 text-right">{p.cofins_aliq}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => delProf.mutate(p.id)} className="text-destructive hover:underline">Remover</button>
                    </td>
                  </tr>
                ))}
                {profiles && profiles.rows.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Nenhum perfil criado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "status" && (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="text-xs uppercase text-muted-foreground">Status SEFAZ {sefaz?.uf ?? ""} — {sefaz?.env}</div>
          <div className={`mt-2 text-3xl font-semibold ${sefaz?.online ? "text-emerald-600" : "text-destructive"}`}>
            {sefaz?.online ? "🟢 Online" : "🔴 Offline"}
          </div>
          {sefaz?.message && <div className="text-xs text-muted-foreground mt-1">{sefaz.message}</div>}
          <div className="mt-3 text-[11px] text-muted-foreground">Atualiza a cada 30s.</div>
        </div>
      )}
    </div>
  );
}

function Field({ name, label, def, type = "text" }: { name: string; label: string; def?: any; type?: string }) {
  return (
    <label className="text-xs space-y-1">
      <span className="text-muted-foreground">{label}</span>
      <input name={name} type={type} defaultValue={def ?? ""}
        className="w-full rounded-md border border-border bg-background px-3 py-1.5" />
    </label>
  );
}
function Select({ name, label, def, options }: { name: string; label: string; def?: string; options: string[] }) {
  return (
    <label className="text-xs space-y-1">
      <span className="text-muted-foreground">{label}</span>
      <select name={name} defaultValue={def}
        className="w-full rounded-md border border-border bg-background px-3 py-1.5">
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function ProfileForm({ onSave }: { onSave: (d: any) => void }) {
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const d: any = {};
      for (const [k, v] of f.entries()) d[k] = v;
      ["icms_aliq", "pis_aliq", "cofins_aliq", "ipi_aliq", "origem"].forEach(k => d[k] = Number(d[k] || 0));
      onSave(d);
      (e.currentTarget as HTMLFormElement).reset();
    }} className="grid gap-2 md:grid-cols-7 rounded-xl border border-border bg-card p-3 text-xs">
      <input name="name" required placeholder="Nome" className="rounded-md border border-border bg-background px-2 py-1.5" />
      <input name="cfop" defaultValue="5102" placeholder="CFOP" className="rounded-md border border-border bg-background px-2 py-1.5" />
      <input name="csosn" placeholder="CSOSN (102...)" className="rounded-md border border-border bg-background px-2 py-1.5" />
      <input name="icms_aliq" type="number" step="0.01" defaultValue="0" placeholder="ICMS %" className="rounded-md border border-border bg-background px-2 py-1.5" />
      <input name="pis_aliq" type="number" step="0.01" defaultValue="0" placeholder="PIS %" className="rounded-md border border-border bg-background px-2 py-1.5" />
      <input name="cofins_aliq" type="number" step="0.01" defaultValue="0" placeholder="COFINS %" className="rounded-md border border-border bg-background px-2 py-1.5" />
      <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground">Adicionar</button>
    </form>
  );
}

function CertificateSection({ settings }: { settings: any }) {
  const setRefFn = useServerFn(setFiscalCertRef);
  const [file, setFile] = React.useState<File | null>(null);
  const [passSecret, setPassSecret] = React.useState<string>(settings?.cert_pass_secret_name ?? "FOCUS_NFE_CERT_PASSWORD");
  const [status, setStatus] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);

  if (!settings?.id) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-6 text-xs text-muted-foreground">
        Salve o emitente primeiro para poder anexar o certificado A1.
      </div>
    );
  }

  const currentPath = settings.cert_secret_name as string | null;

  const upload = async () => {
    if (!file) return;
    if (!/\.(pfx|p12)$/i.test(file.name)) { setStatus("Arquivo precisa ser .pfx ou .p12"); return; }
    setUploading(true); setStatus(null);
    try {
      const path = `${settings.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("fiscal-certs").upload(path, file, {
        contentType: "application/x-pkcs12", upsert: false,
      });
      if (upErr) throw upErr;
      await setRefFn({ data: { settings_id: settings.id, cert_path: path, cert_pass_secret_name: passSecret || null } });
      setStatus(`✓ Certificado enviado. Cadastre a senha no secret ${passSecret}.`);
      setFile(null);
    } catch (e: any) {
      setStatus("Erro: " + (e?.message ?? "falha ao enviar"));
    } finally { setUploading(false); }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Certificado Digital A1 (.pfx / .p12)</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Armazenado no bucket privado <code className="text-[10px]">fiscal-certs</code>. A senha deve ser cadastrada
          separadamente como <b>secret</b> do backend (não digite no formulário) — informe apenas o nome do secret.
        </p>
      </div>

      {currentPath ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs">
          <div className="font-medium text-emerald-700 dark:text-emerald-400">✓ Certificado configurado</div>
          <div className="text-muted-foreground mt-1 font-mono text-[10px] break-all">{currentPath}</div>
          {settings.cert_pass_secret_name && (
            <div className="text-muted-foreground mt-1">Senha via secret: <b>{settings.cert_pass_secret_name}</b></div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
          ⚠ Nenhum certificado enviado. Emissão em produção exigirá A1 válido.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs space-y-1">
          <span className="text-muted-foreground">Arquivo (.pfx / .p12)</span>
          <input type="file" accept=".pfx,.p12,application/x-pkcs12"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs" />
        </label>
        <label className="text-xs space-y-1">
          <span className="text-muted-foreground">Nome do secret com a senha</span>
          <input value={passSecret} onChange={(e) => setPassSecret(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
            placeholder="FOCUS_NFE_CERT_PASSWORD"
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 font-mono" />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={upload} disabled={!file || uploading}
          className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50">
          {uploading ? "Enviando..." : "Enviar certificado"}
        </button>
      </div>

      {status && <div className="text-xs text-muted-foreground">{status}</div>}
    </div>
  );
}
