"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  CalendarDays,
  Trophy,
} from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/** ✅ BEST MOBILE FIX:
 *  - Use a bottom-sheet (Dialog) on mobile instead of Popover
 *  - Keep Popover for desktop
 *  - Prevent focus auto-scroll jump + blur active input on open
 */

function useMediaQuery(query) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.matchMedia(query);

    const onChange = () => setMatches(!!m.matches);
    onChange();

    // Safari < 14 fallback
    if (m.addEventListener) m.addEventListener("change", onChange);
    else m.addListener(onChange);

    return () => {
      if (m.removeEventListener) m.removeEventListener("change", onChange);
      else m.removeListener(onChange);
    };
  }, [query]);

  return matches;
}

function chicagoTodayISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isoFromDate(d) {
  // Treat as plain date (no timezone surprises)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function dateFromISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toChicagoDisplayDate(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(d);
}

function toChicagoAxisDate(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "2-digit",
  }).format(d);
}

function getChicagoWeekdayIndex(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  const weekdayShort = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
  }).format(d);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[weekdayShort] ?? d.getDay();
}

function getChicagoWeekdayLabel(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
  }).format(d);
}

const PAGE_SIZE = 10;

function ChartCard({ title, subtitle, icon: Icon, children, footer }) {
  return (
    <div className="rounded-3xl border border-zinc-700/50 bg-zinc-950/40 backdrop-blur-xl overflow-hidden shadow-xl">
      <div className="px-5 sm:px-6 py-4 border-b border-zinc-800/70 flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-zinc-900/60 border border-zinc-700/60 grid place-items-center shrink-0">
            <Icon className="h-5 w-5 text-zinc-200" />
          </div>
          <div className="min-w-0">
            <div className="text-sm sm:text-base font-semibold text-zinc-100 truncate">{title}</div>
            {subtitle ? <div className="text-xs text-zinc-500 mt-0.5">{subtitle}</div> : null}
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5">{children}</div>

      {footer ? (
        <div className="px-5 sm:px-6 py-3 border-t border-zinc-800/70 text-xs text-zinc-500">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

function DatePicker({
  date,
  setDate,
  today,
  todayDateObj,
  usedDates,
  selectedDateObj,
  dateTaken,
  isFuture,
}) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [open, setOpen] = useState(false);

  const TriggerButton = (
    <button
      type="button"
      onClick={() => {
        // ✅ Prevent mobile keyboard / viewport resize + weird jumps
        if (document?.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        setOpen(true);
      }}
      className={[
        "w-full h-[52px] rounded-2xl bg-zinc-800/50 backdrop-blur-xl border px-4",
        "border-zinc-700/50 hover:bg-zinc-800/70 transition-all",
        "focus:outline-none focus:ring-2 focus:ring-blue-500/30",
        dateTaken || isFuture ? "border-amber-500/40" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="grid place-items-center w-9 h-9 rounded-xl bg-zinc-900/40 border border-zinc-700/40 shrink-0">
          <CalendarIcon className="h-4 w-4 text-zinc-200" />
        </span>

        <div className="flex flex-col items-start leading-tight min-w-0">
          <span className="text-sm text-zinc-100 truncate w-full">{date}</span>
          <span className="text-xs text-zinc-400 truncate w-full">{toChicagoDisplayDate(date)}</span>
        </div>

        <span className="ml-auto text-xs text-zinc-400 shrink-0">Pick</span>
      </div>
    </button>
  );

  const CalendarBody = (
    <>
      <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between gap-2">
        <div className="text-xs text-zinc-300">Choose a date</div>

        <button
          type="button"
          onClick={() => {
            setDate(today);
            setOpen(false);
          }}
          className="px-3 py-1.5 rounded-xl bg-white text-zinc-900 text-xs font-medium hover:bg-zinc-200 transition"
        >
          Today
        </button>
      </div>

      <Calendar
        mode="single"
        selected={selectedDateObj}
        onSelect={(d) => {
          if (!d) return;

          const iso = isoFromDate(d);
          if (d > todayDateObj) return;
          if (usedDates.has(iso)) return;

          setDate(iso);
          setOpen(false);
        }}
        disabled={(d) => d > todayDateObj || usedDates.has(isoFromDate(d))}
        className="p-3"
        classNames={{
          caption_label: "text-sm font-semibold text-zinc-100",
          head_cell: "text-zinc-400 rounded-md w-9 font-medium text-[0.75rem]",
          day: "h-9 w-9 rounded-xl text-zinc-200 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30",
          day_selected: "bg-blue-600 text-white hover:bg-blue-600 focus:bg-blue-600",
          day_today: "border border-blue-500/50",
          day_outside: "text-zinc-600 opacity-40",
          day_disabled: "text-zinc-600 opacity-35",
          nav_button:
            "h-8 w-8 rounded-xl border border-zinc-700 bg-zinc-900/60 text-zinc-200 hover:bg-zinc-800",
        }}
      />
    </>
  );

  // ✅ Mobile: bottom-sheet dialog (NO “popover jump” problem)
  if (isMobile) {
    return (
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (v) {
            if (document?.activeElement instanceof HTMLElement) document.activeElement.blur();
          }
          setOpen(v);
        }}
      >
        <DialogTrigger asChild>{TriggerButton}</DialogTrigger>

        <DialogContent
          className="
            p-0
            border border-zinc-700/60
            bg-zinc-950/95
            backdrop-blur-xl
            shadow-2xl
            rounded-3xl
            w-[calc(100vw-1.25rem)]
            max-w-[420px]
            max-h-[calc(100dvh-1.25rem)]
            overflow-hidden
          "
          // ✅ Avoid focus causing scroll-jumps on mobile
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="max-h-[calc(100dvh-1.25rem)] overflow-y-auto overscroll-contain">
            {CalendarBody}
          </div>

          <div className="p-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full h-11 rounded-2xl bg-zinc-800/60 border border-zinc-700/50 text-zinc-100 text-sm font-medium hover:bg-zinc-800/80 transition"
            >
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ✅ Desktop: popover (safe settings)
  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        if (v) {
          if (document?.activeElement instanceof HTMLElement) document.activeElement.blur();
        }
        setOpen(v);
      }}
      modal
    >
      <PopoverTrigger asChild>{TriggerButton}</PopoverTrigger>

      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={10}
        collisionPadding={16}
        sticky="always"
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="
          z-[9999]
          w-[min(360px,calc(100vw-2rem))]
          p-0
          overflow-hidden
          rounded-2xl
          border border-zinc-700/60
          bg-zinc-950/95
          shadow-2xl
          backdrop-blur-xl
          max-h-[calc(100dvh-120px)]
        "
      >
        <div className="max-h-[calc(100dvh-120px)] overflow-y-auto overscroll-contain">
          {CalendarBody}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function SalesPage() {
  const [me, setMe] = useState(null);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);

  const today = useMemo(() => chicagoTodayISO(), []);
  const todayDateObj = useMemo(() => dateFromISO(today), [today]);

  const [date, setDate] = useState(today);
  const selectedDateObj = useMemo(() => dateFromISO(date), [date]);

  const [sale, setSale] = useState("");
  const [err, setErr] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editingSale, setEditingSale] = useState("");

  const [adding, setAdding] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Mobile view switcher
  const [mobileView, setMobileView] = useState("graphs"); // "graphs" | "data"

  // Pagination for list
  const [page, setPage] = useState(1);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(sales.length / PAGE_SIZE)), [sales.length]);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const pageStart = (page - 1) * PAGE_SIZE;
  const pageEnd = Math.min(sales.length, pageStart + PAGE_SIZE);
  const paginatedSales = useMemo(
    () => sales.slice(pageStart, pageStart + PAGE_SIZE),
    [sales, pageStart]
  );

  const usedDates = useMemo(() => new Set(sales.map((s) => s.date)), [sales]);
  const dateTaken = usedDates.has(date);
  const isFuture = date > today;

  // Sorted ascending copy for chart computations
  const salesAsc = useMemo(() => {
    const arr = [...sales];
    arr.sort((a, b) => a.date.localeCompare(b.date));
    return arr;
  }, [sales]);

  // Latest datapoint (most recent date)
  const latest = useMemo(() => {
    if (salesAsc.length === 0) return null;
    return salesAsc[salesAsc.length - 1];
  }, [salesAsc]);

  // Chart 1: last 15 recorded days (up to 15 points)
  const last15Data = useMemo(() => {
    if (salesAsc.length === 0) return [];
    const slice = salesAsc.slice(Math.max(0, salesAsc.length - 15));
    return slice.map((s) => ({ date: s.date, sale: Number(s.sale) || 0 }));
  }, [salesAsc]);

  // Chart 2: compare latest weekday with last 5 occurrences of that weekday
  const weekdayCompareData = useMemo(() => {
    if (!latest) return { label: "", data: [] };

    const weekdayIdx = getChicagoWeekdayIndex(latest.date);
    const weekdayLabel = getChicagoWeekdayLabel(latest.date);

    const matches = salesAsc
      .filter((s) => getChicagoWeekdayIndex(s.date) === weekdayIdx)
      .sort((a, b) => b.date.localeCompare(a.date)) // newest first
      .slice(0, 5)
      .sort((a, b) => a.date.localeCompare(b.date)); // show oldest->newest

    return {
      label: weekdayLabel,
      data: matches.map((s) => ({ date: s.date, sale: Number(s.sale) || 0 })),
    };
  }, [salesAsc, latest]);

  // Chart 3: top 5 sales days in a year (Jan 1 -> Dec 31)
  const top5YearData = useMemo(() => {
    const year = Number(today.slice(0, 4)); // "current year" in Chicago
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;

    const inYear = salesAsc.filter((s) => s.date >= start && s.date <= end);
    const top = [...inYear]
      .sort((a, b) => (Number(b.sale) || 0) - (Number(a.sale) || 0))
      .slice(0, 5)
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      year,
      countInYear: inYear.length,
      data: top.map((s) => ({ date: s.date, sale: Number(s.sale) || 0 })),
    };
  }, [salesAsc, today]);

  async function load() {
    setLoading(true);
    setErr("");

    const [meRes, salesRes] = await Promise.all([fetch("/api/me"), fetch("/api/sales")]);

    if (!meRes.ok) {
      setErr("Not authenticated");
      setLoading(false);
      return;
    }

    const meData = await meRes.json();
    const salesData = await salesRes.json();

    // list: newest first
    const rows = Array.isArray(salesData.sales) ? salesData.sales : [];
    rows.sort((a, b) => b.date.localeCompare(a.date));

    setMe(meData.user);
    setSales(rows);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  function normalizeSaleInput(value) {
    return value.replace(/,/g, "").replace(/[^\d.]/g, "");
  }

  function formatSaleOnBlur() {
    const raw = sale.trim();
    if (!raw) return;
    const n = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(n)) return;
    setSale(n.toFixed(2));
  }

  async function addSale(e) {
    e.preventDefault();
    if (adding) return;

    setErr("");

    if (date > today) {
      setErr("Future dates are not allowed.");
      return;
    }
    if (dateTaken) {
      setErr("That date already has sales data.");
      return;
    }

    setAdding(true);
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, sale }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data.error || "Failed to save");
        return;
      }

      setSale("");
      await load();
      setPage(1);
    } finally {
      setAdding(false);
    }
  }

  async function startEdit(row) {
    setEditingId(row._id);
    setEditingSale(String(row.sale));
  }

  async function saveEdit(id) {
    if (savingEdit) return;
    setErr("");

    setSavingEdit(true);
    try {
      const res = await fetch(`/api/sales/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sale: editingSale }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data.error || "Failed to update");
        return;
      }

      setEditingId(null);
      setEditingSale("");
      await load();
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteRow(id) {
    if (deletingId) return;
    setErr("");
    setDeletingId(id);

    try {
      const res = await fetch(`/api/sales/${id}`, { method: "DELETE" });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data.error || "Failed to delete");
        return;
      }

      await load();
    } finally {
      setDeletingId(null);
    }
  }

  const ChartsPanel = (
    <div className="space-y-4">
      {/* Chart 1 */}
      <ChartCard
        title="Last 15 days"
        subtitle="Most recent 15 recorded days (shows what you have if fewer)"
        icon={TrendingUp}
        footer={
          last15Data.length < 2
            ? "Still data is too low to show a meaningful trend."
            : `Points shown: ${last15Data.length}`
        }
      >
        <div className="h-[240px] rounded-2xl border border-zinc-700/50 bg-zinc-950/30 p-3">
          {last15Data.length < 2 ? (
            <div className="h-full grid place-items-center text-sm text-zinc-500">
              {last15Data.length === 0 ? "No data to chart yet" : "Only 1 data point — still data is too low"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={last15Data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={toChicagoAxisDate} minTickGap={18} tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `$${formatMoney(v)}`} tick={{ fontSize: 12 }} width={80} />
                <Tooltip
                  formatter={(value) => [`$${formatMoney(value)}`, "Sales"]}
                  labelFormatter={(label) => `${label} • ${toChicagoDisplayDate(label)}`}
                  contentStyle={{
                    background: "rgba(9, 9, 11, 0.95)",
                    border: "1px solid rgba(63, 63, 70, 0.6)",
                    borderRadius: 12,
                  }}
                  labelStyle={{ color: "rgba(244, 244, 245, 0.9)" }}
                  itemStyle={{ color: "rgba(244, 244, 245, 0.9)" }}
                />
                <Line type="monotone" dataKey="sale" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartCard>

      {/* Chart 2 */}
      <ChartCard
        title="Compare with same weekday"
        subtitle={
          latest
            ? `Latest day is ${getChicagoWeekdayLabel(latest.date)} — comparing with last 5 ${getChicagoWeekdayLabel(
                latest.date
              )}s`
            : "Need at least 1 entry"
        }
        icon={CalendarDays}
        footer={
          weekdayCompareData.data.length < 2
            ? "Still data is too low to compare weekdays."
            : `Occurrences shown: ${weekdayCompareData.data.length}`
        }
      >
        <div className="h-[240px] rounded-2xl border border-zinc-700/50 bg-zinc-950/30 p-3">
          {weekdayCompareData.data.length < 2 ? (
            <div className="h-full grid place-items-center text-sm text-zinc-500">
              {weekdayCompareData.data.length === 0
                ? "No data to chart yet"
                : "Only 1 matching weekday — still data is too low"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekdayCompareData.data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={toChicagoAxisDate} minTickGap={12} tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `$${formatMoney(v)}`} tick={{ fontSize: 12 }} width={80} />
                <Tooltip
                  formatter={(value) => [`$${formatMoney(value)}`, "Sales"]}
                  labelFormatter={(label) => `${label} • ${toChicagoDisplayDate(label)}`}
                  contentStyle={{
                    background: "rgba(9, 9, 11, 0.95)",
                    border: "1px solid rgba(63, 63, 70, 0.6)",
                    borderRadius: 12,
                  }}
                  labelStyle={{ color: "rgba(244, 244, 245, 0.9)" }}
                  itemStyle={{ color: "rgba(244, 244, 245, 0.9)" }}
                />
                <Bar dataKey="sale" fill="#22c55e" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartCard>

      {/* Chart 3 */}
      <ChartCard
        title={`Top 5 days in ${top5YearData.year}`}
        subtitle="Highest sales days from Jan 1 to Dec 31 (shows what you have if fewer)"
        icon={Trophy}
        footer={
          top5YearData.countInYear === 0
            ? "No entries found in this year — still data is too low."
            : top5YearData.data.length < 5
              ? `Only ${top5YearData.data.length} day(s) available in ${top5YearData.year} — still data is too low for Top 5.`
              : `Top 5 computed from ${top5YearData.countInYear} day(s) in ${top5YearData.year}`
        }
      >
        <div className="h-[240px] rounded-2xl border border-zinc-700/50 bg-zinc-950/30 p-3">
          {top5YearData.data.length === 0 ? (
            <div className="h-full grid place-items-center text-sm text-zinc-500">
              No data for {top5YearData.year} yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top5YearData.data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={toChicagoAxisDate} minTickGap={12} tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `$${formatMoney(v)}`} tick={{ fontSize: 12 }} width={80} />
                <Tooltip
                  formatter={(value) => [`$${formatMoney(value)}`, "Sales"]}
                  labelFormatter={(label) => `${label} • ${toChicagoDisplayDate(label)}`}
                  contentStyle={{
                    background: "rgba(9, 9, 11, 0.95)",
                    border: "1px solid rgba(63, 63, 70, 0.6)",
                    borderRadius: 12,
                  }}
                  labelStyle={{ color: "rgba(244, 244, 245, 0.9)" }}
                  itemStyle={{ color: "rgba(244, 244, 245, 0.9)" }}
                />
                <Bar dataKey="sale" fill="#a855f7" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartCard>
    </div>
  );

  const DataPanel = (
    <div className="rounded-3xl bg-zinc-900/40 backdrop-blur-2xl border border-zinc-700/50 overflow-hidden shadow-2xl">
      <div className="p-5 sm:p-8 border-b border-zinc-700/50">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-semibold">Sales History</h2>
            <p className="text-sm text-zinc-400 mt-1">
              {me?.isOwner ? "Edit or delete entries as needed" : "View-only access to sales records"}
            </p>
          </div>

          {/* Pagination controls */}
          <div className="flex items-center gap-3">
            <div className="text-xs text-zinc-500 hidden sm:block">
              {sales.length === 0 ? (
                "0 items"
              ) : (
                <>
                  Showing <span className="text-zinc-300">{pageStart + 1}</span>–
                  <span className="text-zinc-300">{pageEnd}</span> of{" "}
                  <span className="text-zinc-300">{sales.length}</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || sales.length === 0}
                className="h-9 w-9 rounded-xl bg-zinc-800/50 backdrop-blur-xl border border-zinc-700/50 hover:bg-zinc-800/70 transition-all disabled:opacity-40 disabled:cursor-not-allowed grid place-items-center"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4 text-zinc-200" />
              </button>

              <div className="text-xs text-zinc-400 min-w-[72px] text-center">
                Page <span className="text-zinc-200">{page}</span>/
                <span className="text-zinc-200">{totalPages}</span>
              </div>

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || sales.length === 0}
                className="h-9 w-9 rounded-xl bg-zinc-800/50 backdrop-blur-xl border border-zinc-700/50 hover:bg-zinc-800/70 transition-all disabled:opacity-40 disabled:cursor-not-allowed grid place-items-center"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4 text-zinc-200" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="divide-y divide-zinc-700/50">
        {paginatedSales.map((row) => (
          <div
            key={row._id}
            className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6 hover:bg-zinc-800/30 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
                <div className="font-medium text-base sm:text-lg">{row.date}</div>
                <div className="text-xs sm:text-sm text-zinc-500">{toChicagoDisplayDate(row.date)}</div>
              </div>

              <div className="text-2xl font-semibold text-zinc-100">${formatMoney(row.sale)}</div>
            </div>

            {me?.isOwner ? (
              <div className="flex flex-wrap items-center justify-start sm:justify-end gap-3">
                {editingId === row._id ? (
                  <>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">$</span>
                      <input
                        value={editingSale}
                        onChange={(e) => setEditingSale(normalizeSaleInput(e.target.value))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(row._id);
                          if (e.key === "Escape") {
                            setEditingId(null);
                            setEditingSale("");
                          }
                        }}
                        className="w-40 rounded-xl bg-zinc-800/50 backdrop-blur-xl border border-zinc-700/50 pl-7 pr-3 py-2.5 outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 text-sm"
                      />
                    </div>

                    <button
                      onClick={() => saveEdit(row._id)}
                      disabled={savingEdit}
                      className="rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2.5 text-sm font-medium hover:from-blue-600 hover:to-blue-700 shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {savingEdit && (
                        <span className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                      )}
                      Save
                    </button>

                    <button
                      onClick={() => {
                        setEditingId(null);
                        setEditingSale("");
                      }}
                      className="rounded-xl bg-zinc-800/50 backdrop-blur-xl border border-zinc-700/50 px-4 py-2.5 text-sm font-medium hover:bg-zinc-800/70 transition-all"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => startEdit(row)}
                      className="rounded-xl bg-zinc-800/50 backdrop-blur-xl border border-zinc-700/50 px-4 py-2.5 text-sm font-medium hover:bg-zinc-800/70 transition-all"
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => deleteRow(row._id)}
                      disabled={deletingId === row._id}
                      className="rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2.5 text-sm font-medium hover:bg-red-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {deletingId === row._id && (
                        <span className="w-4 h-4 border-2 border-red-400/60 border-t-red-400 rounded-full animate-spin" />
                      )}
                      Delete
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="px-4 py-2 rounded-xl bg-zinc-800/30 border border-zinc-700/30 text-sm text-zinc-500">
                Read-only
              </div>
            )}
          </div>
        ))}

        {sales.length === 0 && (
          <div className="p-10 sm:p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                />
              </svg>
            </div>
            <p className="text-zinc-300 font-medium">No sales entries yet</p>
            <p className="text-sm text-zinc-500 mt-1">Add your first entry above to get started</p>
          </div>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-zinc-950 px-4">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-zinc-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-6">
        <div className="min-w-0">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Daily Sales</h1>

          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <div className="px-3 py-1 rounded-full bg-zinc-800/50 backdrop-blur-xl border border-zinc-700/50 text-sm text-zinc-300">
              {me?.name}
            </div>
            <div className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-sm text-blue-400">
              {me?.isOwner ? "Owner" : "Employee"}
            </div>
            <div className="text-xs text-zinc-500 ml-1">Timezone: America/Chicago</div>
          </div>
        </div>

        <button
          onClick={logout}
          className="w-full sm:w-auto rounded-2xl bg-zinc-800/50 backdrop-blur-xl border border-zinc-700/50 px-5 py-3 text-sm font-medium hover:bg-zinc-800/70 transition-all shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          Logout
        </button>
      </header>

      {/* Entry Card */}
      <section className="rounded-3xl bg-zinc-900/40 backdrop-blur-2xl border border-zinc-700/50 p-5 sm:p-8 shadow-2xl">
        <div className="flex items-start gap-3 mb-6">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-semibold">Enter Today&apos;s Total</h2>
            <p className="text-sm text-zinc-400 mt-1">
              Pick a date from the calendar. Already-used dates are disabled.
            </p>
          </div>
        </div>

        <form onSubmit={addSale} className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Date Picker */}
          <div className="md:col-span-5">
            <label className="text-sm font-medium text-zinc-300 mb-2 block">Date (Chicago)</label>

            <DatePicker
              date={date}
              setDate={setDate}
              today={today}
              todayDateObj={todayDateObj}
              usedDates={usedDates}
              selectedDateObj={selectedDateObj}
              dateTaken={dateTaken}
              isFuture={isFuture}
            />

            <div className="mt-2 text-xs text-zinc-500 flex flex-wrap items-center gap-2">
              {dateTaken && <span className="text-amber-400">Already entered for this date</span>}
              {isFuture && <span className="text-amber-400">Future dates not allowed</span>}
              {!dateTaken && !isFuture && <span>Looks good ✅</span>}
            </div>
          </div>

          {/* Amount */}
          <div className="md:col-span-5">
            <label className="text-sm font-medium text-zinc-300 mb-2 block">Sales Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400">$</span>
              <input
                inputMode="decimal"
                value={sale}
                onChange={(e) => setSale(normalizeSaleInput(e.target.value))}
                onBlur={formatSaleOnBlur}
                placeholder="0.00"
                className="w-full rounded-2xl bg-zinc-800/50 backdrop-blur-xl border border-zinc-700/50 pl-8 pr-4 py-3.5 outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-zinc-500"
              />
            </div>
            <p className="text-xs text-zinc-500 mt-2">Auto-formats to 2 decimals when you leave the field.</p>
          </div>

          {/* Submit */}
          <div className="md:col-span-2">
            <div className="h-[22px] mb-2 hidden md:block" />
            <button
              type="submit"
              disabled={dateTaken || isFuture || adding}
              className="w-full h-[52px] rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 font-medium hover:from-blue-600 hover:to-blue-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/30 flex items-center justify-center gap-2"
            >
              {adding && (
                <span className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />
              )}
              Save
            </button>
          </div>
        </form>

        {err && (
          <div
            className="mt-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400 flex items-start gap-2"
            role="alert"
          >
            <svg className="w-4 h-4 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <div className="flex-1 min-w-0">
              <span className="break-words">{err}</span>
              <button
                type="button"
                onClick={() => setErr("")}
                className="ml-3 text-red-300/80 hover:text-red-200 underline underline-offset-2"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Mobile dropdown switcher */}
      <section className="lg:hidden rounded-3xl bg-zinc-900/40 backdrop-blur-2xl border border-zinc-700/50 p-4 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-zinc-200">View</div>
          <select
            value={mobileView}
            onChange={(e) => setMobileView(e.target.value)}
            className="rounded-2xl bg-zinc-800/60 border border-zinc-700/50 px-4 py-2 text-sm text-zinc-200 outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="graphs">Graphs</option>
            <option value="data">Data</option>
          </select>
        </div>

        <div className="mt-4">{mobileView === "graphs" ? ChartsPanel : DataPanel}</div>
      </section>

      {/* Desktop: charts LEFT, data RIGHT */}
      <section className="hidden lg:block">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-6">{ChartsPanel}</div>
          <div className="col-span-6">{DataPanel}</div>
        </div>
      </section>
    </main>
  );
}
