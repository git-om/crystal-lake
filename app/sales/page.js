"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart2, BarChart as BarChartIcon,
  CalendarDays, CheckCircle, Clock, Download, Flame,
  Lightbulb, List, Trophy, TrendingUp, Zap,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  getChicagoTodayISO, isoFromDate, dateFromISO, addDaysToISO,
  getChicagoWeekdayIndex, getChicagoWeekdayLabel,
} from "@/lib/time";
import { fmt, fmtShort, displayDate, axisDate, monthLabel, monthAxisLabel, TT } from "@/lib/format";
import { dampedSeasonalForecast } from "@/lib/forecast";
import { FilterPills } from "@/components/sales/FilterPills";
import { EntryForm } from "@/components/sales/EntryForm";
import { ChartCard, ChartArea } from "@/components/sales/ChartCard";
import { KpiCard, ChangeBadge } from "@/components/sales/KpiCard";

// ─── Constants ────────────────────────────────────────────────────────────────

const HISTORY_LIMIT = 10;
const TABS = [
  { id: "charts",   label: "Charts",   icon: BarChartIcon },
  { id: "history",  label: "History",  icon: List },
  { id: "insights", label: "Insights", icon: Lightbulb },
];

// ─── SalesPage ────────────────────────────────────────────────────────────────

export default function SalesPage() {
  const today        = useMemo(() => getChicagoTodayISO(), []);
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
  const [trendDays,     setTrendDays]     = useState(30);
  const [weekdayCount,  setWeekdayCount]  = useState(5);
  const [topFilter,     setTopFilter]     = useState("year");
  const [monthlyMonths, setMonthlyMonths] = useState(12);
  const [forecastDays,  setForecastDays]  = useState(14);

  // Employee state
  const [empSales, setEmpSales] = useState([]);

  // Shared form state
  const [date,   setDate]   = useState(today);
  const [sale,   setSale]   = useState("");
  const [adding, setAdding] = useState(false);

  const selectedDateObj = useMemo(() => dateFromISO(date), [date]);

  // ── usedDates for date picker ───────────────────────────────────────────────
  const usedDates = useMemo(() => {
    if (me?.isOwner) return new Set(stats?.allDates ?? []);
    return new Set(empSales.map((s) => s.date));
  }, [me?.isOwner, stats?.allDates, empSales]);

  const dateTaken = usedDates.has(date);
  const isFuture  = date > today;

  // ── Derived stats (owner) ───────────────────────────────────────────────────
  const streak = useMemo(() => {
    if (!stats?.allDates?.length) return 0;
    let count = 0, check = today;
    while (usedDates.has(check)) {
      count++;
      const d = dateFromISO(check); d.setDate(d.getDate() - 1); check = isoFromDate(d);
    }
    return count;
  }, [stats?.allDates, usedDates, today]);

  const thisMonthTotal   = stats?.thisMonth?.total       ?? 0;
  const thisMonthCount   = stats?.thisMonth?.count       ?? 0;
  const lastMonthTotal   = stats?.lastMonth?.total       ?? 0;
  const thisWeekTotal    = stats?.thisWeek?.total        ?? 0;
  const thisWeekCount    = stats?.thisWeek?.count        ?? 0;
  const lastWeekTotal    = stats?.lastWeek?.total        ?? 0;
  const thisYearTotal    = stats?.thisYear?.total        ?? 0;
  const thisYearCount    = stats?.thisYear?.count        ?? 0;
  const thisQTotal       = stats?.thisQuarter?.total     ?? 0;
  const lastQTotal       = stats?.lastQuarter?.total     ?? 0;
  const sameMonthLYTotal = stats?.sameMonthLastYear?.total ?? 0;

  const monthChange   = lastMonthTotal   > 0 ? ((thisMonthTotal  - lastMonthTotal)   / lastMonthTotal)   * 100 : null;
  const weekChange    = lastWeekTotal    > 0 ? ((thisWeekTotal   - lastWeekTotal)    / lastWeekTotal)    * 100 : null;
  const quarterChange = lastQTotal       > 0 ? ((thisQTotal      - lastQTotal)       / lastQTotal)       * 100 : null;
  const yoyChange     = sameMonthLYTotal > 0 ? ((thisMonthTotal  - sameMonthLYTotal) / sameMonthLYTotal) * 100 : null;
  const dailyAvg      = thisYearCount > 0 ? thisYearTotal / thisYearCount : 0;

  const dayOfMonth   = parseInt(today.slice(8, 10), 10);
  const consistency  = dayOfMonth > 0 ? (thisMonthCount / dayOfMonth) * 100 : 0;
  const weeksElapsed = Math.max(1, dayOfMonth / 7);
  const avgPerWeek   = thisMonthCount / weeksElapsed;

  const availableMonths = useMemo(
    () => [...new Set((stats?.allDates ?? []).map((d) => d.slice(0, 7)))],
    [stats?.allDates],
  );

  // ── Chart data (owner) — computed client-side from allEntries ───────────────
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
      const key = isoFromDate(d).slice(0, 7);
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
    [allEntries, chartData?.dowAverages, forecastDays],
  );

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

  useEffect(() => {
    if (activeTab === "history") loadHistory();
  }, [activeTab, historyPage, historyMonth, loadHistory]);

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
    if (!sale.trim())  { setErr("Please enter a sales amount."); return; }
    if (isFuture)      { setErr("Future dates are not allowed."); return; }
    if (dateTaken)     { setErr("That date already has sales data."); return; }
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
          <ChartCard title="Sales Trend" subtitle="Recent recorded days" icon={TrendingUp}
            filter={<FilterPills options={[{value:7,label:"7d"},{value:15,label:"15d"},{value:30,label:"30d"},{value:90,label:"90d"}]} value={trendDays} onChange={setTrendDays} />}
            footer={trendData.length < 2 ? "Need more entries." : `${trendData.length} data points`}>
            <ChartArea empty={trendData.length < 2 ? (allEntries.length === 0 ? "No data yet" : "Not enough entries") : null}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(63,63,70,0.4)" />
                  <XAxis dataKey="date" tickFormatter={axisDate} minTickGap={18} tick={{ fontSize: 11, fill: "#71717a" }} />
                  <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: "#71717a" }} width={64} />
                  <Tooltip formatter={(v) => [`$${fmt(v)}`, "Sales"]} labelFormatter={displayDate} contentStyle={TT.contentStyle} labelStyle={TT.labelStyle} itemStyle={TT.itemStyle} />
                  <Line type="monotone" dataKey="sale" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartArea>
          </ChartCard>

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

      {/* ── INSIGHTS TAB ───────────────────────────────────────────────────── */}
      {activeTab === "insights" && (
        <div className="space-y-4">
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

            {/* YoY */}
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

            {/* Logging consistency */}
            <div className="rounded-2xl bg-zinc-900/40 border border-zinc-700/50 p-4 shadow-md">
              <div className="text-xs text-zinc-400 font-medium mb-1">Logging Consistency</div>
              <div className="text-2xl font-semibold text-zinc-100">{consistency.toFixed(0)}%</div>
              <div className="text-xs text-zinc-500 mt-1">
                {thisMonthCount} of {dayOfMonth} days logged · ~{avgPerWeek.toFixed(1)}/wk
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full rounded-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, consistency)}%` }} />
              </div>
            </div>
          </div>

          {/* Best month */}
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

          {/* Forecast + DOW */}
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
