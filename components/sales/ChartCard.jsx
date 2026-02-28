export function ChartCard({ title, subtitle, icon: Icon, children, footer, filter }) {
  return (
    <div className="rounded-2xl border border-zinc-700/50 bg-zinc-900/40 overflow-hidden shadow-lg">
      <div className="px-4 sm:px-5 py-3.5 border-b border-zinc-800/70 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-zinc-800/60 border border-zinc-700/50 grid place-items-center shrink-0">
          <Icon className="h-4 w-4 text-zinc-300" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-zinc-100 truncate">{title}</div>
          {subtitle && <div className="text-xs text-zinc-500 mt-0.5 truncate">{subtitle}</div>}
        </div>
        {filter && <div className="shrink-0">{filter}</div>}
      </div>
      <div className="p-4">{children}</div>
      {footer && (
        <div className="px-4 sm:px-5 py-2.5 border-t border-zinc-800/70 text-xs text-zinc-500">
          {footer}
        </div>
      )}
    </div>
  );
}

export function ChartArea({ empty, children }) {
  return (
    <div className="h-[220px] rounded-xl border border-zinc-700/40 bg-zinc-950/30 p-3">
      {empty
        ? <div className="h-full grid place-items-center text-sm text-zinc-500">{empty}</div>
        : children}
    </div>
  );
}
