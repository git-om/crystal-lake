import { DatePicker } from "@/components/sales/DatePicker";

export function EntryForm({
  date, setDate, sale, setSale, today, todayDateObj, usedDates,
  selectedDateObj, dateTaken, isFuture, adding, onSubmit, err, onDismissErr,
  minDate = null,
}) {
  const normalize = (v) => v.replace(/,/g, "").replace(/[^\d.]/g, "");
  const blurFormat = () => {
    const trimmed = sale.trim().replace(/,/g, "");
    if (!trimmed) return;
    const n = Number(trimmed);
    if (Number.isFinite(n)) setSale(n.toFixed(2));
  };

  return (
    <section className="rounded-2xl bg-zinc-900/40 border border-zinc-700/50 p-5 sm:p-6 shadow-xl">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 grid place-items-center shadow-lg shadow-blue-500/20">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
        <div>
          <h2 className="text-base sm:text-lg font-semibold">Log Sales Entry</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {minDate
              ? "Only the last 7 days are available."
              : "Already-used dates are disabled in the picker."}
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-2">
        {/* 3-column row: Date | Amount | Save */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Date */}
          <div className="md:col-span-5">
            <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Date (Chicago)</label>
            <DatePicker
              date={date} setDate={setDate} today={today} todayDateObj={todayDateObj}
              usedDates={usedDates} selectedDateObj={selectedDateObj} minDate={minDate}
            />
          </div>

          {/* Amount */}
          <div className="md:col-span-5">
            <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Sales Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">$</span>
              <input
                inputMode="decimal"
                value={sale}
                onChange={(e) => setSale(normalize(e.target.value))}
                onBlur={blurFormat}
                placeholder="0.00"
                className="w-full h-[52px] rounded-2xl bg-zinc-800/50 border border-zinc-700/50 pl-8 pr-4 outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-zinc-600 text-sm"
              />
            </div>
          </div>

          {/* Save — invisible spacer label keeps button baseline-aligned with inputs */}
          <div className="md:col-span-2">
            <label className="text-xs font-medium mb-1.5 block invisible" aria-hidden="true">&nbsp;</label>
            <button
              type="submit"
              disabled={dateTaken || isFuture || adding || !sale.trim()}
              className="w-full h-[52px] rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium hover:from-blue-600 hover:to-blue-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/30 flex items-center justify-center gap-2 text-sm"
            >
              {adding && (
                <span className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />
              )}
              Save
            </button>
          </div>
        </div>

        {/* Status text */}
        <div className="text-xs flex gap-2 pl-0.5">
          {dateTaken && <span className="text-amber-400">Date already used</span>}
          {isFuture  && <span className="text-amber-400">Future dates not allowed</span>}
          {!dateTaken && !isFuture && <span className="text-zinc-600">Available ✓</span>}
        </div>
      </form>

      {err && (
        <div
          className="mt-3 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400 flex items-start gap-2"
          role="alert"
        >
          <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <div className="flex-1 min-w-0">
            <span className="break-words">{err}</span>
            <button
              type="button"
              onClick={onDismissErr}
              className="ml-3 text-red-300/80 hover:text-red-200 underline underline-offset-2 text-xs"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
