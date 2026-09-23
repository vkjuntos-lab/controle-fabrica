import { downloadCsv, toCsv } from "@/lib/csv";

export function exportFinanceCsv(filename: string, rows: Record<string, unknown>[]): void {
  const safe = rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === "string" && /^[=+@\-\t\r]/.test(value) ? `'${value}` : value,
      ]),
    ),
  );
  downloadCsv(filename, toCsv(safe));
}