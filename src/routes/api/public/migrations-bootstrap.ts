// One-shot operational bootstrap (protected by LOVABLE_CRON_SECRET).
// Applies the pending migration SQL files stored in the private `migrations`
// storage bucket, in order, recording each version in
// supabase_migrations.schema_migrations. Removed after the bootstrap runs.
import { createFileRoute } from "@tanstack/react-router";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const FILES: Array<[string, string]> = [
  ["20260917093000", "20260917093000_avatars_storage_bucket.sql"],
  ["20260917093100", "20260917093100_webhook_events.sql"],
  ["20260917100000", "20260917100000_invitations.sql"],
  ["20260917100001", "20260917100001_audit_log_insert_policy.sql"],
  ["20260917100002", "20260917100002_role_permissions_manage.sql"],
  ["20260917110000", "20260917110000_catalog_mestre.sql"],
  ["20260918100000", "20260918100000_inventory_ledger.sql"],
  ["20260921100000", "20260921100000_inventory_integrity.sql"],
  ["20260922100000", "20260922100000_production.sql"],
  ["20260923100000", "20260923100000_inventory_workflows.sql"],
  ["20260924100000", "20260924100000_partners.sql"],
  ["20260926100000", "20260926100000_partner_reconciliation.sql"],
  ["20260928100000", "20260928100000_finance.sql"],
  ["20260930100000", "20260930100000_cost_engine.sql"],
  ["20261001100000", "20261001100000_purchasing.sql"],
  ["20261002100000", "20261002100000_planning.sql"],
  ["20261003100000", "20261003100000_planning_engine.sql"],
  ["20261004100000", "20261004100000_planning_fixes.sql"],
  ["20261005100000", "20261005100000_crm.sql"],
  ["20261006100000", "20261006100000_crm_integrity.sql"],
  ["20261006100001", "20261006100000_sales_orders.sql"],
  ["20261007100000", "20261007100000_crm_documents.sql"],
  ["20261008100000", "20261008100000_crm_company_services.sql"],
  ["20261009100000", "20261009100000_crm_customer_history.sql"],
  ["20261010100000", "20261010100000_sales_integrity.sql"],
  ["20261011100000", "20261011100000_sales_planning.sql"],
];

export const Route = createFileRoute("/api/public/migrations-bootstrap")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = request.headers.get("x-cron-key") ?? "";
        const expected = process.env["LOVABLE_CRON_SECRET"];
        if (!expected || key !== expected) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        const dbUrl = process.env["SUPABASE_DB_URL"];
        if (!dbUrl) return Response.json({ error: "SUPABASE_DB_URL missing" }, { status: 500 });

        const admin = createClient(
          process.env["SUPABASE_URL"]!,
          process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const client = postgres(dbUrl, { max: 1, idle_timeout: 5, connect_timeout: 10 });
        const results: Array<Record<string, unknown>> = [];
        try {
          const diag = await client`select current_user as user, has_schema_privilege('public', 'CREATE') as can_create`;
          results.push({ file: "_diag", ...diag[0] });
          for (const [version, file] of FILES) {
            let applied = false;
            try {
              const done = await client`select 1 from supabase_migrations.schema_migrations where version = ${version} limit 1`;
              applied = done.length > 0;
            } catch {
              // Fallback when supabase_migrations is not readable by this role.
              const marker = await client`select 1 from public._bootstrap_migrations where version = ${version} limit 1`.catch(() => []);
              applied = marker.length > 0;
            }
            if (applied) {
              results.push({ file, status: "skipped" });
              continue;
            }
            let text: string;
            try {
              const { data, error } = await admin.storage.from("migrations").download(file);
              if (error || !data) {
                results.push({ file, status: "MISSING", error: error?.message });
                continue;
              }
              text = await data.text();
            } catch (e) {
              results.push({ file, status: "DOWNLOAD_FAIL", error: String(e) });
              continue;
            }
            try {
              await client.begin(async (tx) => {
                await tx.unsafe(text);
                await tx`insert into supabase_migrations.schema_migrations(version, name) values (${version}, ${file})`;
              });
              results.push({ file, status: "ok", bytes: text.length });
            } catch (e) {
              results.push({ file, status: "SQL_FAIL", error: e instanceof Error ? e.message : String(e) });
              break; // order matters: stop at the first failure
            }
          }
        } finally {
          await client.end();
        }
        return Response.json(results);
      },
    },
  },
});
