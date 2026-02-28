"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownRight, ArrowUpRight, BarChart2, BarChart as BarChartIcon,
  CalendarDays, CheckCircle, Clock, Download, Flame,
  Lightbulb, List, Trophy, TrendingUp, Zap,
  Calendar as CalendarIcon, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

// ─── Media query ──────────────────────────────────────────────────────────────

function useMediaQuery(query) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.matchMedia(query);
    const update = () => setMatches(!!m.matches);
    update();
    m.addEventListener ? m.addEventListener("change", update) : m.addListener(update);
    return () => m.removeEventListener ? m.removeEventListener("change", update) : m.removeListener(update);
  }, [query]);
  return matches;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function chicagoTodayISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function pad2(n) { return String(n).padStart(2, "0"); }
function isoFromDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function dateFromISO(iso) { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); }
function addDaysToISO(iso, n) { const d = dateFromISO(iso); d.setDate(d.getDate() + n); return isoFromDate(d); }

function getChicagoWeekdayIndex(isoDate) {
  const short = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" })
    .format(new Date(`${isoDate}T00:00:00`));
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[short] ?? 0;
}
function getChicagoWeekdayLabel(isoDate) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "long" })
    .format(new Date(`${isoDate}T00:00:00`));
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00";
}
function fmtShort(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
function displayDate(iso) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", weekday: "short", month: "short", day: "2-digit", year: "numeric",
  }).format(new Date(`${iso}T00:00:00`));
}
function axisDate(iso) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "2-digit" })
    .format(new Date(`${iso}T00:00:00`));
}
function monthLabel(yyyyMM) {
  const [y, m] = yyyyMM.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" }).format(new Date(y, m - 1, 1));
}
function monthAxisLabel(yyyyMM) {
  const [y, m] = yyyyMM.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(y, m - 1, 1));
}

// ─── Damped-Trend Seasonal Forecast ──────────────────────────────────────────
//
// Algorithm: Multiplicative seasonal decomposition (day-of-week factors from
// ALL historical data, server-computed) + exponentially weighted linear
// regression on the de-seasonalized series + damped trend projection.
//
// Damping (φ = 0.95) means the slope tapers off instead of projecting linearly
// to ±∞. This is a proven improvement used in the M-competition winners.
//
// Seasonal factors use the server-provided dowAverages which cover ALL data —
// far more accurate than computing from just the last 30 entries.

function dampedSeasonalForecast(allEntries, dowAverages, forecastDays = 14) {
  const n = allEntries.length;
  if (n < 5 || !dowAverages?.length) return null;

  // Global mean from server DOW averages (all-time data)
  const totalCount = dowAverages.reduce((s, d) => s + d.count, 0);
  if (totalCount === 0) return null;
  const globalMean = dowAverages.reduce((s, d) => s + d.avg * d.count, 0) / totalCount;
  if (globalMean === 0) return null;

  // Raw multiplicative seasonal factors per weekday
  const rawFactors = Array.from({ length: 7 }, (_, i) => {
    const d = dowAverages.find((x) => x.dow === i);
    return d && d.count > 0 ? d.avg / globalMean : 1;
  });

  // Normalize so active-day factors average to 1
  const activeIdx  = dowAverages.filter((d) => d.count > 0).map((d) => d.dow);
  const factorSum  = activeIdx.reduce((s, i) => s + rawFactors[i], 0);
  const norm       = activeIdx.length > 0 ? activeIdx.length / factorSum : 1;
  const dowFactors = rawFactors.map((f, i) => activeIdx.includes(i) ? f * norm : 1);

  // Attach weekday index to each entry and de-seasonalize
  const entries  = allEntries.map((e) => ({ ...e, dow: getChicagoWeekdayIndex(e.date) }));
  const deseas   = entries.map(({ sale, dow }) => dowFactors[dow] > 0 ? sale / dowFactors[dow] : sale);

  // Exponentially weighted linear regression
  // Weight decays so the oldest point has ~5% of the weight of the newest
  const lambda = Math.log(20) / Math.max(n - 1, 1);
  let wS = 0, wX = 0, wY = 0, wXX = 0, wXY = 0;
  deseas.forEach((y, i) => {
    const w = Math.exp(lambda * (i - (n - 1)));
    wS += w; wX += w * i; wY += w * y; wXX += w * i * i; wXY += w * y * i;
  });
  const det = wS * wXX - wX * wX;
  if (Math.abs(det) < 1e-10) return null;
  const slope     = (wS * wXY - wX * wY) / det;
  const intercept = (wY - slope * wX) / wS;

  // R² (unweighted, on de-seasonalized series)
  const yMean = deseas.reduce((s, y) => s + y, 0) / n;
  const ssTot = deseas.reduce((s, y) => s + (y - yMean) ** 2, 0);
  const ssRes = deseas.reduce((s, y, i) => s + (y - (slope * i + intercept)) ** 2, 0);
  const r2    = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  // Damped trend: φ + φ² + … + φ^h = φ(1−φ^h)/(1−φ)
  const phi    = 0.95;
  const L_last = slope * (n - 1) + intercept; // de-seasonalized level at last recorded date

  // Chart data: last 14 actuals + trend + forecastDays predicted
  const histSlice  = entries.slice(-14);
  const histOffset = n - histSlice.length;

  const combined = histSlice.map((e, i) => {
    const xi    = histOffset + i;
    const trend = +Math.max(0, (slope * xi + intercept) * dowFactors[e.dow]).toFixed(2);
    return { date: e.date, actual: e.sale, trend, predicted: null };
  });

  for (let h = 1; h <= forecastDays; h++) {
    const fDate    = addDaysToISO(entries[n - 1].date, h);
    const dow      = getChicagoWeekdayIndex(fDate);
    const dampedT  = slope * phi * (1 - Math.pow(phi, h)) / (1 - phi);
    const pred     = +Math.max(0, (L_last + dampedT) * dowFactors[dow]).toFixed(2);
    combined.push({ date: fDate, actual: null, trend: null, predicted: pred });
  }

  const confidence    = r2 > 0.6 ? "High" : r2 > 0.3 ? "Moderate" : "Low";
  const trendDir      = slope > 50 ? "upward" : slope < -50 ? "downward" : "flat";
  const lastActualDate = histSlice[histSlice.length - 1].date;

  return { combined, r2, confidence, trendDir, lastActualDate, usedPoints: n };
}

// ─── Shared chart style ───────────────────────────────────────────────────────

const TT = {
  contentStyle: { background: "rgba(9,9,11,0.96)", border: "1px solid rgba(63,63,70,0.6)", borderRadius: 12 },
  labelStyle:   { color: "rgba(244,244,245,0.9)" },
  itemStyle:    { color: "rgba(244,244,245,0.9)" },
};

// ─── UI primitives ────────────────────────────────────────────────────────────

function FilterPills({ options, value, onChange }) {
  return (
    <div className="flex gap-0.5 p-0.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={[
            "px-2 py-1 rounded-md text-xs font-medium transition-all",
            value === o.value ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300",
          ].join(" ")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ChartCard({ title, subtitle, icon: Icon, children, footer, filter }) {
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
        <div className="px-4 sm:px-5 py-2.5 border-t border-zinc-800/70 text-xs text-zinc-500">{footer}</div>
      )}
    </div>
  );
}

function ChartArea({ empty, children }) {
  return (
    <div className="h-[220px] rounded-xl border border-zinc-700/40 bg-zinc-950/30 p-3">
      {empty
        ? <div className="h-full grid place-items-center text-sm text-zinc-500">{empty}</div>
        : children}
    </div>
  );
}

function KpiCard({ icon: Icon, iconColor, label, value, sub, badge }) {
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

function ChangeBadge({ value }) {
  if (value === null || value === undefined) return null;
  const up = value >= 0;
  return (
    <span className={`flex items-center gap-0.5 ${up ? "text-green-400" : "text-red-400"}`}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {up ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}

// ─── DatePicker ───────────────────────────────────────────────────────────────

function DatePicker({ date, setDate, today, todayDateObj, usedDates, selectedDateObj, minDate = null }) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [open, setOpen] = useState(false);
  const blur = () => { if (document?.activeElement instanceof HTMLElement) document.activeElement.blur(); };
  const minDateObj = minDate ? dateFromISO(minDate) : null;

  const Trigger = (
    <button
      type="button"
      onClick={() => { blur(); setOpen(true); }}
      className="w-full h-[52px] rounded-2xl bg-zinc-800/50 border border-zinc-700/50 px-4 hover:bg-zinc-800/70 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/30"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="grid place-items-center w-8 h-8 rounded-xl bg-zinc-900/40 border border-zinc-700/40 shrink-0">
          <CalendarIcon className="h-4 w-4 text-zinc-200" />
        </span>
        <div className="flex flex-col items-start leading-tight min-w-0">
          <span className="text-sm text-zinc-100 truncate w-full">{date}</span>
          <span className="text-xs text-zinc-400 truncate w-full">{displayDate(date)}</span>
        </div>
        <span className="ml-auto text-xs text-zinc-500 shrink-0">Pick</span>
      </div>
    </button>
  );

  const Cal = (
    <>
      <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between gap-2">
        <span className="text-xs text-zinc-400">Choose a date</span>
        <button type="button" onClick={() => { setDate(today); setOpen(false); }}
          className="px-3 py-1.5 rounded-xl bg-white text-zinc-900 text-xs font-medium hover:bg-zinc-200 transition">
          Today
        </button>
      </div>
      <div className="bg-zinc-950/95">
        <Calendar
          mode="single"
          selected={selectedDateObj}
          onSelect={(d) => {
            if (!d) return;
            const iso = isoFromDate(d);
            if (d > todayDateObj || (minDateObj && d < minDateObj) || usedDates.has(iso)) return;
            setDate(iso); setOpen(false);
          }}
          disabled={(d) => d > todayDateObj || (minDateObj && d < minDateObj) || usedDates.has(isoFromDate(d))}
          className="p-3 !bg-transparent"
          classNames={{
            month_grid: "w-full",
            caption_label: "text-sm font-semibold text-zinc-100",
            weekday: "text-zinc-400 rounded-md w-9 font-medium text-[0.75rem]",
            today: "bg-blue-500/10 rounded-md data-[selected=true]:rounded-none",
            outside: "text-zinc-600 opacity-40",
            disabled: "text-zinc-600 opacity-35",
            button_previous: "inline-flex items-center justify-center h-8 w-8 rounded-xl border border-zinc-700 bg-zinc-900/60 text-zinc-200 hover:bg-zinc-800 p-0",
            button_next: "inline-flex items-center justify-center h-8 w-8 rounded-xl border border-zinc-700 bg-zinc-900/60 text-zinc-200 hover:bg-zinc-800 p-0",
          }}
        />
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={(v) => { if (v) blur(); setOpen(v); }}>
        <DialogTrigger asChild>{Trigger}</DialogTrigger>
        <DialogContent showCloseButton={false} onOpenAutoFocus={(e) => e.preventDefault()}
          className="p-0 border border-zinc-700/60 bg-zinc-950/95 backdrop-blur-xl shadow-2xl rounded-3xl w-[calc(100vw-1.25rem)] max-w-[420px] max-h-[calc(100dvh-1.25rem)] overflow-hidden">
          <DialogTitle className="sr-only">Pick a date</DialogTitle>
          <div className="max-h-[calc(100dvh-1.25rem)] overflow-y-auto overscroll-contain">{Cal}</div>
          <div className="p-3 border-t border-zinc-800">
            <button type="button" onClick={() => setOpen(false)}
              className="w-full h-11 rounded-2xl bg-zinc-800/60 border border-zinc-700/50 text-zinc-100 text-sm font-medium hover:bg-zinc-800/80 transition">
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover open={open} onOpenChange={(v) => { if (v) blur(); setOpen(v); }} modal>
      <PopoverTrigger asChild>{Trigger}</PopoverTrigger>
      <PopoverContent align="start" side="bottom" sideOffset={10} collisionPadding={16} sticky="always"
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="z-[9999] w-[min(360px,calc(100vw-2rem))] p-0 overflow-hidden rounded-2xl border border-zinc-700/60 bg-zinc-950/95 shadow-2xl backdrop-blur-xl">
        {Cal}
      </PopoverContent>
    </Popover>
  );
}

// ─── Entry Form (shared) ──────────────────────────────────────────────────────

function EntryForm({ date, setDate, sale, setSale, today, todayDateObj, usedDates,
  selectedDateObj, dateTaken, isFuture, adding, onSubmit, err, onDismissErr, minDate = null }) {
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
          <p className="text-xs text-zinc-500 mt-0.5">{minDate ? "Only the last 7 days are available." : "Already-used dates are disabled in the picker."}</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-2">
        {/* ── 3-column row: Date | Amount | Save ── */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Date */}
          <div className="md:col-span-5">
            <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Date (Chicago)</label>
            <DatePicker date={date} setDate={setDate} today={today} todayDateObj={todayDateObj}
              usedDates={usedDates} selectedDateObj={selectedDateObj} minDate={minDate} />
          </div>

          {/* Amount */}
          <div className="md:col-span-5">
            <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Sales Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">$</span>
              <input
                inputMode="decimal" value={sale}
                onChange={(e) => setSale(normalize(e.target.value))} onBlur={blurFormat}
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
              {adding && <span className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />}
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
        <div className="mt-3 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400 flex items-start gap-2" role="alert">
          <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <div className="flex-1 min-w-0">
            <span className="break-words">{err}</span>
            <button type="button" onClick={onDismissErr} className="ml-3 text-red-300/80 hover:text-red-200 underline underline-offset-2 text-xs">Dismiss</button>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── SalesPage ────────────────────────────────────────────────────────────────

const HISTORY_LIMIT = 10;
const TABS = [
  { id: "charts",   label: "Charts",   icon: BarChartIcon },
  { id: "history",  label: "History",  icon: List },
  { id: "insights", label: "Insights", icon: Lightbulb },
];

export default function SalesPage() {
  const today        = useMemo(() => chicagoTodayISO(), []);
  const todayDateObj = useMemo(() => dateFromISO(today), [today]);
  const empMinDate   = useMemo(() => addDaysToISO(today, -6), [today]);

  const [me,             setMe]             = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [err,            setErr]            = useState("");

  // Owner state
  const [stats,          setStats]          = useState(null);
  const [chartData,      setChartData]      = useState(null);
  const [history,        setHistory]        = useState({ sales: [], total: 0, pages: 1 });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage,    setHistoryPage]    = useState(1);
  const [historyMonth,   setHistoryMonth]   = useState("all");
  const [activeTab,      setActiveTab]      = useState("charts");
  const [editingId,      setEditingId]      = useState(null);
  const [editingSale,    setEditingSale]    = useState("");
  const [savingEdit,     setSavingEdit]     = useState(false);
  const [deletingId,     setDeletingId]     = useState(null);

  // Chart filters (owner)
  const [trendDays,      setTrendDays]      = useState(30);
  const [weekdayCount,   setWeekdayCount]   = useState(5);
  const [topFilter,      setTopFilter]      = useState("year");
  const [monthlyMonths,  setMonthlyMonths]  = useState(12);
  const [forecastDays,   setForecastDays]   = useState(14);

  // Employee state
  const [empSales,       setEmpSales]       = useState([]);

  // Shared form state
  const [date,  setDate]  = useState(today);
  const [sale,  setSale]  = useState("");
  const [adding, setAdding] = useState(false);

  const selectedDateObj = useMemo(() => dateFromISO(date), [date]);

  // ── usedDates for date picker ───────────────────────────────────────────────

  // Owner: all recorded dates (from stats)
  // Employee: dates from their last 7 entries only
  const usedDates = useMemo(() => {
    if (me?.isOwner) return new Set(stats?.allDates ?? []);
    return new Set(empSales.map((s) => s.date));
  }, [me?.isOwner, stats?.allDates, empSales]);

  const dateTaken = usedDates.has(date);
  const isFuture  = date > today;

  // ── Derived from stats (owner) ──────────────────────────────────────────────

  const streak = useMemo(() => {
    if (!stats?.allDates?.length) return 0;
    let count = 0, check = today;
    while (usedDates.has(check)) {
      count++;
      const d = dateFromISO(check); d.setDate(d.getDate() - 1); check = isoFromDate(d);
    }
    return count;
  }, [stats?.allDates, usedDates, today]);

  const thisMonthTotal  = stats?.thisMonth?.total ?? 0;
  const thisMonthCount  = stats?.thisMonth?.count ?? 0;
  const lastMonthTotal  = stats?.lastMonth?.total ?? 0;
  const thisWeekTotal   = stats?.thisWeek?.total  ?? 0;
  const thisWeekCount   = stats?.thisWeek?.count  ?? 0;
  const lastWeekTotal   = stats?.lastWeek?.total  ?? 0;
  const thisYearTotal   = stats?.thisYear?.total  ?? 0;
  const thisYearCount   = stats?.thisYear?.count  ?? 0;
  const thisQTotal      = stats?.thisQuarter?.total ?? 0;
  const lastQTotal      = stats?.lastQuarter?.total ?? 0;
  const sameMonthLYTotal = stats?.sameMonthLastYear?.total ?? 0;

  const monthChange   = lastMonthTotal  > 0 ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100 : null;
  const weekChange    = lastWeekTotal   > 0 ? ((thisWeekTotal  - lastWeekTotal)  / lastWeekTotal)  * 100 : null;
  const quarterChange = lastQTotal      > 0 ? ((thisQTotal     - lastQTotal)     / lastQTotal)     * 100 : null;
  const yoyChange     = sameMonthLYTotal > 0 ? ((thisMonthTotal - sameMonthLYTotal) / sameMonthLYTotal) * 100 : null;
  const dailyAvg      = thisYearCount > 0 ? thisYearTotal / thisYearCount : 0;

  // Logging velocity for this month
  const dayOfMonth   = parseInt(today.slice(8, 10), 10);
  const consistency  = dayOfMonth > 0 ? (thisMonthCount / dayOfMonth) * 100 : 0;
  const weeksElapsed = Math.max(1, dayOfMonth / 7);
  const avgPerWeek   = thisMonthCount / weeksElapsed;

  // Available months for history filter
  const availableMonths = useMemo(
    () => [...new Set((stats?.allDates ?? []).map((d) => d.slice(0, 7)))],
    [stats?.allDates]
  );

  // ── Chart computations (owner) — all derived from allEntries client-side ───

  const allEntries = useMemo(() => chartData?.allEntries ?? [], [chartData]);

  const trendData = useMemo(() => allEntries.slice(-trendDays), [allEntries, trendDays]);

  const weekdayCompare = useMemo(() => {
    if (!allEntries.length) return { label: "", data: [] };
    const latest    = allEntries[allEntries.length - 1];
    const latestDow = getChicagoWeekdayIndex(latest.date);
    const data      = allEntries.filter((e) => getChicagoWeekdayIndex(e.date) === latestDow).slice(-weekdayCount);
    return { label: getChicagoWeekdayLabel(latest.date), data };
  }, [allEntries, weekdayCount]);

  const monthlyData = useMemo(() => {
    const byMonth = {};
    allEntries.forEach((e) => { const k = e.date.slice(0, 7); byMonth[k] = (byMonth[k] || 0) + e.sale; });
    return Array.from({ length: monthlyMonths }, (_, i) => {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (monthlyMonths - 1 - i));
      const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
      return { month: key, total: byMonth[key] ?? 0 };
    });
  }, [allEntries, monthlyMonths]);

  const top5Data = useMemo(() => {
    const year = today.slice(0, 4);
    let filtered = allEntries;
    if (topFilter === "year")     filtered = allEntries.filter((e) => e.date.startsWith(year));
    if (topFilter === "lastyear") filtered = allEntries.filter((e) => e.date.startsWith(String(Number(year) - 1)));
    return [...filtered].sort((a, b) => b.sale - a.sale).slice(0, 5).sort((a, b) => a.date.localeCompare(b.date));
  }, [allEntries, topFilter, today]);

  const dayOfWeekData = useMemo(() => {
    const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return [1, 2, 3, 4, 5, 6, 0].map((i) => {
      const found = (chartData?.dowAverages ?? []).find((d) => d.dow === i);
      return { day: DAYS[i], avg: found?.avg ?? 0, count: found?.count ?? 0 };
    });
  }, [chartData?.dowAverages]);

  const forecastResult = useMemo(
    () => allEntries.length >= 5 ? dampedSeasonalForecast(allEntries, chartData?.dowAverages, forecastDays) : null,
    [allEntries, chartData?.dowAverages, forecastDays]
  );

  // Best month from all entries
  const bestMonth = useMemo(() => {
    const byMonth = {};
    allEntries.forEach((e) => { const k = e.date.slice(0, 7); byMonth[k] = (byMonth[k] || 0) + e.sale; });
    const entries = Object.entries(byMonth);
    if (!entries.length) return null;
    const [month, total] = entries.reduce((best, cur) => cur[1] > best[1] ? cur : best);
    return { month, total };
  }, [allEntries]);

  // ── API loaders ─────────────────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    const p = new URLSearchParams({ page: historyPage, limit: HISTORY_LIMIT });
    if (historyMonth !== "all") p.set("month", historyMonth);
    const res = await fetch(`/api/sales?${p}`);
    if (res.ok) setHistory(await res.json());
    setHistoryLoading(false);
  }, [historyPage, historyMonth]);

  async function loadInitial() {
    setLoading(true);
    const meRes = await fetch("/api/me");
    if (!meRes.ok) { window.location.href = "/login"; return; }
    const { user } = await meRes.json();
    setMe(user);

    if (user.isOwner) {
      const [sRes, cRes] = await Promise.all([fetch("/api/sales/stats"), fetch("/api/sales/chart-data")]);
      if (sRes.ok) setStats(await sRes.json());
      if (cRes.ok) setChartData(await cRes.json());
    } else {
      const res = await fetch("/api/sales?limit=7");
      if (res.ok) setEmpSales((await res.json()).sales ?? []);
    }
    setLoading(false);
  }

  async function refreshOwner() {
    const [sRes, cRes] = await Promise.all([fetch("/api/sales/stats"), fetch("/api/sales/chart-data")]);
    if (sRes.ok) setStats(await sRes.json());
    if (cRes.ok) setChartData(await cRes.json());
    if (activeTab === "history") await loadHistory();
  }

  async function refreshEmployee() {
    const res = await fetch("/api/sales?limit=7");
    if (res.ok) setEmpSales((await res.json()).sales ?? []);
  }

  useEffect(() => { loadInitial(); }, []);

  // Lazy history: load when tab opens or page/month changes
  useEffect(() => {
    if (activeTab === "history") loadHistory();
  }, [activeTab, historyPage, historyMonth, loadHistory]);

  // Reset page when month filter changes
  const prevMonth = useRef(historyMonth);
  useEffect(() => {
    if (prevMonth.current !== historyMonth) { prevMonth.current = historyMonth; setHistoryPage(1); }
  }, [historyMonth]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  function normSale(v) { return v.replace(/,/g, "").replace(/[^\d.]/g, ""); }

  async function addSale(e) {
    e.preventDefault(); if (adding) return;
    setErr("");
    if (!sale.trim()) { setErr("Please enter a sales amount."); return; }
    if (isFuture)     { setErr("Future dates are not allowed."); return; }
    if (dateTaken)    { setErr("That date already has sales data."); return; }
    setAdding(true);
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, sale }),
      });
      if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || "Failed to save"); return; }
      setSale("");
      if (me?.isOwner) { await refreshOwner(); setHistoryPage(1); }
      else             { await refreshEmployee(); }
    } finally { setAdding(false); }
  }

  function startEdit(row) {
    setEditingId(row._id);
    setEditingSale(String(row.sale));
  }

  async function saveEdit(id) {
    if (savingEdit) return; setErr(""); setSavingEdit(true);
    try {
      const res = await fetch(`/api/sales/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sale: editingSale }),
      });
      if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || "Failed to update"); return; }
      setEditingId(null); setEditingSale(""); await refreshOwner();
    } finally { setSavingEdit(false); }
  }

  async function deleteRow(id) {
    if (deletingId) return; setErr(""); setDeletingId(id);
    try {
      const res = await fetch(`/api/sales/${id}`, { method: "DELETE" });
      if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || "Failed to delete"); return; }
      await refreshOwner();
    } finally { setDeletingId(null); }
  }

  async function exportCSV() {
    const res = await fetch("/api/sales?limit=9999");
    if (!res.ok) return;
    const { sales } = await res.json();
    const rows = [["Date", "Day", "Sales Amount"],
      ...[...sales].sort((a, b) => a.date.localeCompare(b.date)).map((s) => [s.date, displayDate(s.date), s.sale])];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
      download: `sales-${today}.csv`,
    });
    a.click();
  }

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-zinc-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // ── Shared form props ────────────────────────────────────────────────────────

  const formProps = {
    date, setDate, sale, setSale: (v) => setSale(normSale(v)), today, todayDateObj,
    usedDates, selectedDateObj, dateTaken, isFuture, adding,
    onSubmit: addSale, err, onDismissErr: () => setErr(""),
  };

  // ── EMPLOYEE VIEW ────────────────────────────────────────────────────────────

  if (!me?.isOwner) {
    return (
      <main className="max-w-xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-5">
        {/* Header */}
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Daily Sales</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-full bg-zinc-800/60 border border-zinc-700/50 text-xs text-zinc-300">{me?.name}</span>
              <span className="px-2.5 py-1 rounded-full bg-zinc-700/40 border border-zinc-600/40 text-xs text-zinc-400">Employee</span>
              {empSales.some((s) => s.date === today) ? (
                <span className="px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-xs text-green-400 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Today logged
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full bg-zinc-800/40 border border-zinc-700/40 text-xs text-zinc-500 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Today pending
                </span>
              )}
            </div>
          </div>
          <button onClick={logout}
            className="rounded-xl bg-zinc-800/50 border border-zinc-700/50 px-4 py-2.5 text-sm font-medium hover:bg-zinc-800/70 transition-all">
            Logout
          </button>
        </header>

        <EntryForm {...formProps} minDate={empMinDate} />

        {/* Last 7 days */}
        <div className="rounded-2xl bg-zinc-900/40 border border-zinc-700/50 overflow-hidden shadow-lg">
          <div className="px-5 py-4 border-b border-zinc-700/50">
            <h2 className="text-sm font-semibold">Your Last 7 Entries</h2>
          </div>
          <div className="divide-y divide-zinc-700/40">
            {empSales.length === 0 ? (
              <div className="py-12 text-center text-zinc-500 text-sm">No entries yet</div>
            ) : empSales.map((row) => (
              <div key={row._id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-zinc-200">{displayDate(row.date)}</div>
                  <div className="text-xs text-zinc-500">{row.date}</div>
                </div>
                <div className="text-lg font-semibold text-zinc-100">${fmt(row.sale)}</div>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  // ── OWNER VIEW ───────────────────────────────────────────────────────────────

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-5">

      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Daily Sales</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-zinc-800/60 border border-zinc-700/50 text-xs text-zinc-300">{me?.name}</span>
            <span className="px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400 font-medium">Owner</span>
            {stats?.todayEntry ? (
              <span className="px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-xs text-green-400 flex items-center gap-1">
                <CheckCircle className="h-3 w-3" /> Today logged
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full bg-zinc-800/40 border border-zinc-700/40 text-xs text-zinc-500 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Today pending
              </span>
            )}
            {streak >= 2 && (
              <span className="px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 flex items-center gap-1">
                <Zap className="h-3 w-3" /> {streak}-day streak
              </span>
            )}
            <span className="text-xs text-zinc-600">America/Chicago</span>
          </div>
        </div>
        <button onClick={logout}
          className="w-full sm:w-auto rounded-xl bg-zinc-800/50 border border-zinc-700/50 px-4 py-2.5 text-sm font-medium hover:bg-zinc-800/70 transition-all">
          Logout
        </button>
      </header>

      {/* Entry form */}
      <EntryForm {...formProps} />

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={CalendarDays} iconColor="bg-blue-500/10 border border-blue-500/20 text-blue-400"
          label="This Month" value={`$${fmt(thisMonthTotal)}`}
          sub={<>{thisMonthCount} entries {monthChange !== null && <><span className="text-zinc-700">·</span><ChangeBadge value={monthChange} /><span className="text-zinc-600 hidden sm:inline">vs last mo</span></>}</>}
        />
        <KpiCard
          icon={TrendingUp} iconColor="bg-green-500/10 border border-green-500/20 text-green-400"
          label="This Week" value={`$${fmt(thisWeekTotal)}`}
          sub={weekChange === null ? <>{thisWeekCount} entries</> : <><ChangeBadge value={weekChange} /><span className="text-zinc-600 hidden sm:inline">vs last wk</span></>}
        />
        <KpiCard
          icon={Trophy} iconColor="bg-purple-500/10 border border-purple-500/20 text-purple-400"
          label="This Year" value={`$${fmt(thisYearTotal)}`}
          sub={<>avg ${fmt(dailyAvg)}/day</>}
        />
        <KpiCard
          icon={Flame} iconColor="bg-amber-500/10 border border-amber-500/20 text-amber-400"
          label="Best Day" value={stats?.bestDay ? `$${fmt(stats.bestDay.sale)}` : "—"}
          sub={stats?.bestDay ? displayDate(stats.bestDay.date) : "No data yet"}
        />
      </div>

      {/* Tabs */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex gap-1 p-1 rounded-2xl bg-zinc-900/60 border border-zinc-700/50 w-fit">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={["flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/30 whitespace-nowrap",
                activeTab === id ? "bg-zinc-800 text-zinc-100 shadow-sm" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"].join(" ")}>
              <Icon className="h-4 w-4 shrink-0" />{label}
            </button>
          ))}
        </div>
      </div>

      {/* ── CHARTS TAB ─────────────────────────────────────────────────────── */}
      {activeTab === "charts" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Trend */}
          <ChartCard title="Sales Trend" subtitle="Recent recorded days" icon={TrendingUp}
            filter={<FilterPills options={[{value:7,label:"7d"},{value:15,label:"15d"},{value:30,label:"30d"},{value:90,label:"90d"}]} value={trendDays} onChange={setTrendDays} />}
            footer={trendData.length < 2 ? "Need more entries." : `${trendData.length} data points`}>
            <ChartArea empty={trendData.length < 2 ? (allEntries.length === 0 ? "No data yet" : "Not enough entries") : null}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(63,63,70,0.4)" />
                  <XAxis dataKey="date" tickFormatter={axisDate} minTickGap={18} tick={{ fontSize: 11, fill: "#71717a" }} />
                  <YAxis tickFormatter={(v) => fmtShort(v)} tick={{ fontSize: 11, fill: "#71717a" }} width={64} />
                  <Tooltip formatter={(v) => [`$${fmt(v)}`, "Sales"]} labelFormatter={displayDate} contentStyle={TT.contentStyle} labelStyle={TT.labelStyle} itemStyle={TT.itemStyle} />
                  <Line type="monotone" dataKey="sale" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartArea>
          </ChartCard>

          {/* Same-weekday */}
          <ChartCard title="Same-weekday history" subtitle={weekdayCompare.label ? `Last ${weekdayCount} ${weekdayCompare.label}s` : "Need at least 1 entry"} icon={CalendarDays}
            filter={<FilterPills options={[{value:5,label:"5x"},{value:10,label:"10x"},{value:20,label:"20x"}]} value={weekdayCount} onChange={setWeekdayCount} />}
            footer={weekdayCompare.data.length < 2 ? "Need more same-weekday entries." : `${weekdayCompare.data.length} occurrences`}>
            <ChartArea empty={weekdayCompare.data.length < 2 ? "Not enough matching days" : null}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekdayCompare.data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(63,63,70,0.4)" />
                  <XAxis dataKey="date" tickFormatter={axisDate} minTickGap={12} tick={{ fontSize: 11, fill: "#71717a" }} />
                  <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: "#71717a" }} width={64} />
                  <Tooltip formatter={(v) => [`$${fmt(v)}`, "Sales"]} labelFormatter={displayDate} contentStyle={TT.contentStyle} labelStyle={TT.labelStyle} itemStyle={TT.itemStyle} />
                  <Bar dataKey="sale" fill="#22c55e" radius={[8, 8, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </ChartArea>
          </ChartCard>

          {/* Top 5 */}
          <ChartCard title="Top 5 days" subtitle="Highest single-day sales" icon={Trophy}
            filter={<FilterPills options={[{value:"year",label:today.slice(0,4)},{value:"lastyear",label:String(Number(today.slice(0,4))-1)},{value:"all",label:"All"}]} value={topFilter} onChange={setTopFilter} />}
            footer={top5Data.length === 0 ? "No data for selected period." : `${top5Data.length} shown`}>
            <ChartArea empty={top5Data.length === 0 ? "No data for selected period" : null}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top5Data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(63,63,70,0.4)" />
                  <XAxis dataKey="date" tickFormatter={axisDate} minTickGap={12} tick={{ fontSize: 11, fill: "#71717a" }} />
                  <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: "#71717a" }} width={64} />
                  <Tooltip formatter={(v) => [`$${fmt(v)}`, "Sales"]} labelFormatter={displayDate} contentStyle={TT.contentStyle} labelStyle={TT.labelStyle} itemStyle={TT.itemStyle} />
                  <Bar dataKey="sale" fill="#a855f7" radius={[8, 8, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </ChartArea>
          </ChartCard>

          {/* Monthly */}
          <ChartCard title="Monthly totals" subtitle="Combined sales by month" icon={BarChart2}
            filter={<FilterPills options={[{value:6,label:"6mo"},{value:12,label:"12mo"}]} value={monthlyMonths} onChange={setMonthlyMonths} />}
            footer={`${monthlyData.filter((m) => m.total > 0).length} month(s) with data`}>
            <ChartArea empty={monthlyData.every((m) => m.total === 0) ? "No data yet" : null}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(63,63,70,0.4)" />
                  <XAxis dataKey="month" tickFormatter={monthAxisLabel} minTickGap={8} tick={{ fontSize: 11, fill: "#71717a" }} />
                  <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: "#71717a" }} width={64} />
                  <Tooltip formatter={(v) => [`$${fmt(v)}`, "Total"]} labelFormatter={monthLabel} contentStyle={TT.contentStyle} labelStyle={TT.labelStyle} itemStyle={TT.itemStyle} />
                  <Bar dataKey="total" fill="#f59e0b" radius={[6, 6, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </ChartArea>
          </ChartCard>
        </div>
      )}

      {/* ── HISTORY TAB ────────────────────────────────────────────────────── */}
      {activeTab === "history" && (
        <div className="rounded-2xl bg-zinc-900/40 border border-zinc-700/50 overflow-hidden shadow-xl">
          <div className="px-5 py-4 border-b border-zinc-700/50 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Sales History</h2>
                <p className="text-xs text-zinc-500 mt-0.5">Edit or delete entries below</p>
              </div>
              {(stats?.allDates?.length ?? 0) > 0 && (
                <button type="button" onClick={exportCSV}
                  className="flex items-center gap-1.5 shrink-0 rounded-xl bg-zinc-800/50 border border-zinc-700/50 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800/70 transition-all">
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <select value={historyMonth} onChange={(e) => setHistoryMonth(e.target.value)}
                className="rounded-xl bg-zinc-800/50 border border-zinc-700/50 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:ring-2 focus:ring-blue-500/30">
                <option value="all">All months ({stats?.allDates?.length ?? 0})</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m}>{monthLabel(m)} ({(stats?.allDates ?? []).filter((d) => d.startsWith(m)).length})</option>
                ))}
              </select>

              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500 hidden sm:block">
                  {history.total > 0 ? <>{(historyPage-1)*HISTORY_LIMIT+1}–{Math.min(history.total,historyPage*HISTORY_LIMIT)} of {history.total}</> : "0 items"}
                </span>
                <button onClick={() => setHistoryPage((p) => Math.max(1, p - 1))} disabled={historyPage === 1 || historyLoading}
                  className="h-8 w-8 rounded-xl bg-zinc-800/50 border border-zinc-700/50 hover:bg-zinc-800/70 transition-all disabled:opacity-40 disabled:cursor-not-allowed grid place-items-center">
                  <ChevronLeft className="h-4 w-4 text-zinc-200" />
                </button>
                <span className="text-xs text-zinc-400 min-w-[52px] text-center">{historyPage}<span className="text-zinc-600">/</span>{history.pages}</span>
                <button onClick={() => setHistoryPage((p) => Math.min(history.pages, p + 1))} disabled={historyPage === history.pages || historyLoading}
                  className="h-8 w-8 rounded-xl bg-zinc-800/50 border border-zinc-700/50 hover:bg-zinc-800/70 transition-all disabled:opacity-40 disabled:cursor-not-allowed grid place-items-center">
                  <ChevronRight className="h-4 w-4 text-zinc-200" />
                </button>
              </div>
            </div>
          </div>

          <div className="divide-y divide-zinc-700/40">
            {historyLoading ? (
              <div className="py-14 grid place-items-center">
                <div className="w-8 h-8 border-4 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : history.sales.length === 0 ? (
              <div className="py-14 text-center">
                <div className="w-12 h-12 rounded-xl bg-zinc-800/50 grid place-items-center mx-auto mb-3">
                  <List className="w-6 h-6 text-zinc-600" />
                </div>
                {historyMonth !== "all" ? (
                  <>
                    <p className="text-zinc-400 text-sm">No entries for {monthLabel(historyMonth)}</p>
                    <button onClick={() => setHistoryMonth("all")} className="mt-2 text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2">Show all</button>
                  </>
                ) : <p className="text-zinc-400 text-sm">No entries yet</p>}
              </div>
            ) : history.sales.map((row) => (
              <div key={row._id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-zinc-800/20 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mb-0.5">
                    <span className="font-medium text-sm">{row.date}</span>
                    <span className="text-xs text-zinc-500">{displayDate(row.date)}</span>
                  </div>
                  <div className="text-xl font-semibold text-zinc-100">${fmt(row.sale)}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {editingId === row._id ? (
                    <>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">$</span>
                        <input value={editingSale}
                          onChange={(e) => setEditingSale(e.target.value.replace(/[^\d.]/g, ""))}
                          onKeyDown={(e) => { if (e.key === "Enter") saveEdit(row._id); if (e.key === "Escape") { setEditingId(null); setEditingSale(""); } }}
                          className="w-36 rounded-xl bg-zinc-800/50 border border-zinc-700/50 pl-7 pr-3 py-2 outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 text-sm" />
                      </div>
                      <button onClick={() => saveEdit(row._id)} disabled={savingEdit}
                        className="rounded-xl bg-blue-600 text-white px-3 py-2 text-sm font-medium hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center gap-1.5">
                        {savingEdit && <span className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />}Save
                      </button>
                      <button onClick={() => { setEditingId(null); setEditingSale(""); }}
                        className="rounded-xl bg-zinc-800/50 border border-zinc-700/50 px-3 py-2 text-sm hover:bg-zinc-800/70 transition-all">Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEdit(row)}
                        className="rounded-xl bg-zinc-800/50 border border-zinc-700/50 px-3 py-2 text-sm hover:bg-zinc-800/70 transition-all">Edit</button>
                      <button onClick={() => deleteRow(row._id)} disabled={deletingId === row._id}
                        className="rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2 text-sm hover:bg-red-500/20 transition-all disabled:opacity-50 flex items-center gap-1.5">
                        {deletingId === row._id && <span className="w-3.5 h-3.5 border-2 border-red-400/60 border-t-red-400 rounded-full animate-spin" />}Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── INSIGHTS TAB (owner) ────────────────────────────────────────────── */}
      {activeTab === "insights" && (
        <div className="space-y-4">

          {/* Analytics cards row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Quarter Q/Q */}
            <div className="rounded-2xl bg-zinc-900/40 border border-zinc-700/50 p-4 shadow-md">
              <div className="text-xs text-zinc-400 font-medium mb-1">This Quarter</div>
              <div className="text-2xl font-semibold text-zinc-100">{fmtShort(thisQTotal)}</div>
              <div className="text-xs text-zinc-500 mt-1">{stats?.thisQuarter?.count ?? 0} entries</div>
              {quarterChange !== null ? (
                <div className="mt-2 flex items-center gap-1 text-xs">
                  <ChangeBadge value={quarterChange} />
                  <span className="text-zinc-600">vs last quarter</span>
                </div>
              ) : lastQTotal === 0 ? (
                <div className="mt-2 text-xs text-zinc-600">No last-quarter data</div>
              ) : null}
            </div>

            {/* YoY current month */}
            <div className="rounded-2xl bg-zinc-900/40 border border-zinc-700/50 p-4 shadow-md">
              <div className="text-xs text-zinc-400 font-medium mb-1">Year-over-Year (this month)</div>
              <div className="text-2xl font-semibold text-zinc-100">{fmtShort(thisMonthTotal)}</div>
              <div className="text-xs text-zinc-500 mt-1">Last yr: {fmtShort(sameMonthLYTotal)}</div>
              {yoyChange !== null ? (
                <div className="mt-2 flex items-center gap-1 text-xs">
                  <ChangeBadge value={yoyChange} />
                  <span className="text-zinc-600">vs same month last year</span>
                </div>
              ) : <div className="mt-2 text-xs text-zinc-600">No last-year data</div>}
            </div>

            {/* Logging velocity */}
            <div className="rounded-2xl bg-zinc-900/40 border border-zinc-700/50 p-4 shadow-md">
              <div className="text-xs text-zinc-400 font-medium mb-1">Logging Consistency</div>
              <div className="text-2xl font-semibold text-zinc-100">{consistency.toFixed(0)}%</div>
              <div className="text-xs text-zinc-500 mt-1">
                {thisMonthCount} of {dayOfMonth} days logged · ~{avgPerWeek.toFixed(1)}/wk
              </div>
              {/* Progress bar */}
              <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full rounded-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, consistency)}%` }} />
              </div>
            </div>
          </div>

          {/* Best month insight */}
          {bestMonth && (
            <div className="rounded-2xl bg-zinc-900/40 border border-zinc-700/50 px-5 py-4 flex flex-wrap items-center gap-4 shadow-md">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 grid place-items-center shrink-0">
                <Flame className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <div className="text-xs text-zinc-500">Best month ever</div>
                <div className="text-sm font-semibold text-zinc-100">{monthLabel(bestMonth.month)} — ${fmt(bestMonth.total)}</div>
              </div>
              {forecastResult && (
                <div className="ml-auto text-xs text-zinc-500 text-right">
                  <div>Trend: <span className={forecastResult.trendDir === "upward" ? "text-green-400" : forecastResult.trendDir === "downward" ? "text-red-400" : "text-zinc-400"}>{forecastResult.trendDir}</span></div>
                  <div>Confidence: {forecastResult.confidence}</div>
                </div>
              )}
            </div>
          )}

          {/* Forecast + Day-of-week */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Sales Forecast" subtitle="Damped-trend seasonal model" icon={TrendingUp}
              filter={<FilterPills options={[{value:7,label:"7d"},{value:14,label:"14d"}]} value={forecastDays} onChange={setForecastDays} />}
              footer={forecastResult
                ? <>Based on {forecastResult.usedPoints} pts · Confidence: <strong>{forecastResult.confidence}</strong> (R²={forecastResult.r2.toFixed(2)}) · Trend: {forecastResult.trendDir}</>
                : "Need 5+ entries."}>
              <ChartArea empty={!forecastResult ? "Not enough data (need 5+ entries)" : null}>
                {forecastResult && (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={forecastResult.combined} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(63,63,70,0.4)" />
                      <XAxis dataKey="date" tickFormatter={axisDate} minTickGap={20} tick={{ fontSize: 11, fill: "#71717a" }} />
                      <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: "#71717a" }} width={64} />
                      <Tooltip
                        formatter={(v, name) => [`$${fmt(v)}`, name === "actual" ? "Actual" : name === "trend" ? "Trend" : "Forecast"]}
                        labelFormatter={axisDate} contentStyle={TT.contentStyle} labelStyle={TT.labelStyle} itemStyle={TT.itemStyle}
                      />
                      <ReferenceLine x={forecastResult.lastActualDate} stroke="#52525b" strokeDasharray="4 2"
                        label={{ value: "Today", fill: "#71717a", fontSize: 10 }} />
                      <Bar dataKey="actual" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={28} name="actual" />
                      <Line dataKey="trend" stroke="#60a5fa" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="trend" connectNulls={false} />
                      <Line dataKey="predicted" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3"
                        dot={{ r: 4, fill: "#f59e0b", strokeWidth: 0 }} name="predicted" connectNulls={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </ChartArea>
            </ChartCard>

            <ChartCard title="Average by Day of Week" subtitle="All-time historical average (Chicago)" icon={CalendarDays}
              footer={`Computed from ${stats?.allDates?.length ?? 0} total entries`}>
              <ChartArea empty={(stats?.allDates?.length ?? 0) < 7 ? "Need entries across more weekdays" : null}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dayOfWeekData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(63,63,70,0.4)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#71717a" }} />
                    <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: "#71717a" }} width={64} />
                    <Tooltip
                      formatter={(v, _n, props) => [`$${fmt(v)} avg (${props.payload?.count ?? 0} entries)`, "Avg Sales"]}
                      contentStyle={TT.contentStyle} labelStyle={TT.labelStyle} itemStyle={TT.itemStyle}
                    />
                    <Bar dataKey="avg" fill="#8b5cf6" radius={[6, 6, 0, 0]} maxBarSize={44} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartArea>
            </ChartCard>
          </div>
        </div>
      )}

    </main>
  );
}

