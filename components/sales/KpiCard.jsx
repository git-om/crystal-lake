import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export function KpiCard({ icon: Icon, iconColor, label, value, sub, badge }) {
  return (
    <div className="rounded-2xl bg-zinc-900/40 border border-zinc-700/50 p-4 shadow-md">
      <div className="flex items-center gap-2 mb-2.5">
        <div className={`w-7 h-7 rounded-lg ${iconColor} grid place-items-center shrink-0`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-xs text-zinc-400 font-medium">{label}</span>
      </div>
      <div className="text-lg sm:text-xl font-semibold text-zinc-100 truncate">{value}</div>
      <div className="text-xs mt-1 flex items-center gap-1.5 text-zinc-500">{sub}</div>
      {badge && <div className="mt-2">{badge}</div>}
    </div>
  );
}

export function ChangeBadge({ value }) {
  if (value === null || value === undefined) return null;
  const up = value >= 0;
  return (
    <span className={`flex items-center gap-0.5 ${up ? "text-green-400" : "text-red-400"}`}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {up ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}
