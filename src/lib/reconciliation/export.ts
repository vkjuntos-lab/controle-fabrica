import { exportPartnerCsv } from "@/lib/partners/export";
/** Reutiliza a infraestrutura CSV existente (neutralizando fórmulas de planilha). */
export function exportReconciliationCsv(filename: string, rows: Record<string, unknown>[]) {
  exportPartnerCsv(filename, rows);
}
