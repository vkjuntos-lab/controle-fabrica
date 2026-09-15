import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const ring =
    tone === "success"
      ? "ring-emerald-500/20"
      : tone === "warning"
      ? "ring-amber-500/25"
      : tone === "danger"
      ? "ring-destructive/25"
      : "ring-border";
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4 ring-1 shadow-sm",
        ring,
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-card-foreground">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
