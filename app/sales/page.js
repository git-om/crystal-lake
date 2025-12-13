"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function chicagoTodayISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toChicagoDisplayDate(isoDate) {
  // Avoid timezone shifting by anchoring at midnight.
  const d = new Date(`${isoDate}T00:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(d);
}

export default function SalesPage() {
  const [me, setMe] = useState(null);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);

  const today = useMemo(() => chicagoTodayISO(), []);
  const [date, setDate] = useState(today);
  const [sale, setSale] = useState("");
  const [err, setErr] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editingSale, setEditingSale] = useState("");

  // UX: prevent double submits / show spinners (no functional changes to API/data)
  const [adding, setAdding] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const dateInputRef = useRef(null);

  const usedDates = useMemo(() => new Set(sales.map((s) => s.date)), [sales]);
  const dateTaken = usedDates.has(date);
  const isFuture = date > today;

  const stats = useMemo(() => {
    const count = sales.length;
    const latest = sales.reduce((acc, r) => (acc && acc > r.date ? acc : r.date), "");
    return { count, latest };
  }, [sales]);

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

    setMe(meData.user);
    setSales(salesData.sales || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  function openNativeDatePicker() {
    const el = dateInputRef.current;
    if (!el) return;
    // Chrome/Edge support showPicker(); others will just focus.
    if (typeof el.showPicker === "function") el.showPicker();
    else el.focus();
  }

  function normalizeSaleInput(value) {
    // Keep functionality (still a string), just cleans UX:
    // allow digits + dot, strip commas/spaces
    const cleaned = value.replace(/,/g, "").replace(/[^\d.]/g, "");
    return cleaned;
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

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-zinc-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6 py-12">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 mb-10">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight mb-3">Daily Sales</h1>

          <div className="flex flex-wrap items-center gap-3">
            <div className="px-3 py-1 rounded-full bg-zinc-800/50 backdrop-blur-xl border border-zinc-700/50 text-sm text-zinc-300">
              {me?.name}
            </div>
            <div className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-sm text-blue-400">
              {me?.isOwner ? "Owner" : "Employee"}
            </div>

            <div className="hidden sm:flex items-center gap-2 text-sm text-zinc-400 ml-1">
              <span className="w-1 h-1 rounded-full bg-zinc-600" />
              <span>{stats.count} entr{stats.count === 1 ? "y" : "ies"}</span>
              {stats.latest ? (
                <>
                  <span className="w-1 h-1 rounded-full bg-zinc-600" />
                  <span>Latest: {stats.latest}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <button
          onClick={logout}
          className="rounded-2xl bg-zinc-800/50 backdrop-blur-xl border border-zinc-700/50 px-5 py-3 text-sm font-medium hover:bg-zinc-800/70 transition-all shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          Logout
        </button>
      </header>

      <section className="rounded-3xl bg-zinc-900/40 backdrop-blur-2xl border border-zinc-700/50 p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold">Enter Today&apos;s Total</h2>
            <p className="text-sm text-zinc-400 mt-1">
              Dates are in <span className="text-zinc-300">America/Chicago</span>. Future dates are disabled.
            </p>
          </div>
        </div>

        <form onSubmit={addSale} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 items-end">
          <div>
            <label className="text-sm font-medium text-zinc-300 mb-2 block">Date</label>

            <div className="relative">
              <button
                type="button"
                onClick={openNativeDatePicker}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-zinc-800/40 border border-zinc-700/40 hover:bg-zinc-800/60 transition-all grid place-items-center focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                aria-label="Open date picker"
                title="Open date picker"
              >
                <svg className="w-4 h-4 text-zinc-300" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M8 7V3m8 4V3M4 11h16M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"
                  />
                </svg>
              </button>

              <input
                ref={dateInputRef}
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-2xl bg-zinc-800/50 backdrop-blur-xl border border-zinc-700/50 pl-14 pr-28 py-3.5 outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all [color-scheme:dark]"
                aria-invalid={dateTaken || isFuture ? "true" : "false"}
              />

              <button
                type="button"
                onClick={() => setDate(today)}
                className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-2 rounded-xl bg-zinc-800/40 border border-zinc-700/40 text-sm text-zinc-200 hover:bg-zinc-800/60 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/25"
              >
                Today
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <div className="text-zinc-500">Selected: {toChicagoDisplayDate(date)}</div>

              {dateTaken && (
                <div className="text-amber-400 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Already entered for this date
                </div>
              )}

              {isFuture && (
                <div className="text-amber-400 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM9 5a1 1 0 012 0v5a1 1 0 01-.293.707l-2 2a1 1 0 01-1.414-1.414L9 9.586V5z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Future dates not allowed
                </div>
              )}
            </div>
          </div>

          <div>
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
            <p className="text-xs text-zinc-500 mt-2">Tip: you can paste numbers like 1234.5 — it will format on blur.</p>
          </div>

          <button
            type="submit"
            disabled={dateTaken || isFuture || adding}
            className="rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 text-white px-8 py-3.5 font-medium hover:from-blue-600 hover:to-blue-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:from-blue-500 disabled:hover:to-blue-600 shadow-lg shadow-blue-500/20 transition-all hover:shadow-blue-500/30 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 flex items-center justify-center gap-2"
          >
            {adding && <span className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />}
            Save Entry
          </button>
        </form>

        {err && (
          <div
            className="mt-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400 flex items-start gap-2"
            role="alert"
            aria-live="polite"
          >
            <svg className="w-4 h-4 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>

            <div className="flex-1">
              {err}
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

      <section className="rounded-3xl bg-zinc-900/40 backdrop-blur-2xl border border-zinc-700/50 overflow-hidden shadow-2xl">
        <div className="p-8 border-b border-zinc-700/50 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-semibold">Sales History</h2>
            </div>
            <p className="text-sm text-zinc-400">
              {me?.isOwner ? "Edit or delete entries as needed" : "View-only access to sales records"}
            </p>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-zinc-500">
            <div className="px-3 py-2 rounded-2xl bg-zinc-800/30 border border-zinc-700/30">
              Dates are stored as <span className="text-zinc-300">YYYY-MM-DD</span>
            </div>
          </div>
        </div>

        <div className="divide-y divide-zinc-700/50">
          {sales.map((row) => (
            <div
              key={row._id}
              className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 hover:bg-zinc-800/30 transition-colors"
            >
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
                  <div className="font-medium text-lg">{row.date}</div>
                  <div className="text-sm text-zinc-500">{toChicagoDisplayDate(row.date)}</div>
                </div>

                <div className="text-2xl font-semibold text-zinc-100">
                  ${formatMoney(row.sale)}
                </div>
              </div>

              {me?.isOwner ? (
                <div className="flex items-center gap-3">
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
                          aria-label="Edit sales amount"
                        />
                      </div>

                      <button
                        onClick={() => saveEdit(row._id)}
                        disabled={savingEdit}
                        className="rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2.5 text-sm font-medium hover:from-blue-600 hover:to-blue-700 shadow-lg shadow-blue-500/20 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                        className="rounded-xl bg-zinc-800/50 backdrop-blur-xl border border-zinc-700/50 px-4 py-2.5 text-sm font-medium hover:bg-zinc-800/70 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(row)}
                        className="rounded-xl bg-zinc-800/50 backdrop-blur-xl border border-zinc-700/50 px-4 py-2.5 text-sm font-medium hover:bg-zinc-800/70 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => deleteRow(row._id)}
                        disabled={deletingId === row._id}
                        className="rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2.5 text-sm font-medium hover:bg-red-500/20 transition-all focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
            <div className="p-12 text-center">
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
      </section>
    </main>
  );
}
