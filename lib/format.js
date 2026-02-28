// ─── Number formatters ────────────────────────────────────────────────────────

export function fmt(v) {
  const n = Number(v);
  return Number.isFinite(n)
    ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";
}

export function fmtShort(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

// ─── Date label formatters ────────────────────────────────────────────────────

export function displayDate(iso) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(`${iso}T00:00:00`));
}

export function axisDate(iso) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "2-digit",
  }).format(new Date(`${iso}T00:00:00`));
}

export function monthLabel(yyyyMM) {
  const [y, m] = yyyyMM.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" })
    .format(new Date(y, m - 1, 1));
}

export function monthAxisLabel(yyyyMM) {
  const [y, m] = yyyyMM.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short" })
    .format(new Date(y, m - 1, 1));
}

// ─── Shared recharts tooltip style ───────────────────────────────────────────

export const TT = {
  contentStyle: {
    background: "rgba(9,9,11,0.96)",
    border: "1px solid rgba(63,63,70,0.6)",
    borderRadius: 12,
  },
  labelStyle: { color: "rgba(244,244,245,0.9)" },
  itemStyle:  { color: "rgba(244,244,245,0.9)" },
};
