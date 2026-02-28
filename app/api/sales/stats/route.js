import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Sale from "@/models/Sale";
import { requireUser } from "@/lib/auth";
import { getChicagoTodayISO, nextMonthStart } from "@/lib/time";

function pad2(n) { return String(n).padStart(2, "0"); }

function isoFromDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function getWeekBounds(todayISO) {
  const d = new Date(`${todayISO}T00:00:00`);
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
  }).format(d);
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[short] ?? d.getDay();
  const mondayOffset = dow === 0 ? 6 : dow - 1;

  const wsDate = new Date(`${todayISO}T00:00:00`);
  wsDate.setDate(wsDate.getDate() - mondayOffset);
  const weekStart = isoFromDate(wsDate);

  const lweDate = new Date(`${weekStart}T00:00:00`);
  lweDate.setDate(lweDate.getDate() - 1);
  const lastWeekEnd = isoFromDate(lweDate);

  const lwsDate = new Date(`${lastWeekEnd}T00:00:00`);
  lwsDate.setDate(lwsDate.getDate() - 6);
  const lastWeekStart = isoFromDate(lwsDate);

  return { weekStart, lastWeekStart, lastWeekEnd };
}

function getQuarterBounds(todayISO) {
  const year  = Number(todayISO.slice(0, 4));
  const month = Number(todayISO.slice(5, 7));
  const qStartMonth = Math.floor((month - 1) / 3) * 3 + 1; // 1, 4, 7, or 10
  const thisQuarterStart = `${year}-${pad2(qStartMonth)}-01`;

  // Last quarter end = calendar day before this quarter's first day
  const lqEndDate = new Date(year, qStartMonth - 1, 0);
  const lastQuarterEnd = isoFromDate(lqEndDate);

  let lqStartMonth = qStartMonth - 3;
  let lqYear = year;
  if (lqStartMonth <= 0) { lqStartMonth += 12; lqYear -= 1; }
  const lastQuarterStart = `${lqYear}-${pad2(lqStartMonth)}-01`;

  return { thisQuarterStart, lastQuarterStart, lastQuarterEnd };
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const today        = getChicagoTodayISO();
  const thisMonthISO = today.slice(0, 7);
  const yearStart    = `${today.slice(0, 4)}-01-01`;
  const yearEnd      = `${today.slice(0, 4)}-12-31`;

  const [y, m] = thisMonthISO.split("-").map(Number);
  const lmd = new Date(y, m - 2, 1);
  const lastMonthISO = `${lmd.getFullYear()}-${pad2(lmd.getMonth() + 1)}`;

  // Same month last year: YYYY-1 + same 2-digit month
  const sameMonthLY = `${y - 1}-${pad2(m)}`;

  const { weekStart, lastWeekStart, lastWeekEnd } = getWeekBounds(today);
  const { thisQuarterStart, lastQuarterStart, lastQuarterEnd } = getQuarterBounds(today);

  await dbConnect();

  const [
    thisMonthAgg,
    lastMonthAgg,
    thisWeekAgg,
    lastWeekAgg,
    thisYearAgg,
    thisQuarterAgg,
    lastQuarterAgg,
    sameMonthLYAgg,
    bestDay,
    todayEntry,
    allDatesDocs,
  ] = await Promise.all([
    Sale.aggregate([
      { $match: { date: { $gte: `${thisMonthISO}-01`, $lt: nextMonthStart(thisMonthISO) } } },
      { $group: { _id: null, total: { $sum: "$sale" }, count: { $sum: 1 } } },
    ]),
    Sale.aggregate([
      { $match: { date: { $gte: `${lastMonthISO}-01`, $lt: `${thisMonthISO}-01` } } },
      { $group: { _id: null, total: { $sum: "$sale" } } },
    ]),
    Sale.aggregate([
      { $match: { date: { $gte: weekStart, $lte: today } } },
      { $group: { _id: null, total: { $sum: "$sale" }, count: { $sum: 1 } } },
    ]),
    Sale.aggregate([
      { $match: { date: { $gte: lastWeekStart, $lte: lastWeekEnd } } },
      { $group: { _id: null, total: { $sum: "$sale" } } },
    ]),
    Sale.aggregate([
      { $match: { date: { $gte: yearStart, $lte: yearEnd } } },
      { $group: { _id: null, total: { $sum: "$sale" }, count: { $sum: 1 } } },
    ]),
    Sale.aggregate([
      { $match: { date: { $gte: thisQuarterStart, $lte: today } } },
      { $group: { _id: null, total: { $sum: "$sale" }, count: { $sum: 1 } } },
    ]),
    Sale.aggregate([
      { $match: { date: { $gte: lastQuarterStart, $lte: lastQuarterEnd } } },
      { $group: { _id: null, total: { $sum: "$sale" } } },
    ]),
    Sale.aggregate([
      { $match: { date: { $gte: `${sameMonthLY}-01`, $lt: nextMonthStart(sameMonthLY) } } },
      { $group: { _id: null, total: { $sum: "$sale" } } },
    ]),
    Sale.findOne().sort({ sale: -1 }).select("date sale -_id").lean(),
    Sale.findOne({ date: today }).select("_id date sale").lean(),
    // Index-only scan — only reads date field, no document fetch
    Sale.find({}, { date: 1, _id: 0 }).sort({ date: -1 }).lean(),
  ]);

  return NextResponse.json({
    thisMonth:       thisMonthAgg[0]    ?? { total: 0, count: 0 },
    lastMonth:       { total: lastMonthAgg[0]?.total    ?? 0 },
    thisWeek:        thisWeekAgg[0]     ?? { total: 0, count: 0 },
    lastWeek:        { total: lastWeekAgg[0]?.total     ?? 0 },
    thisYear:        thisYearAgg[0]     ?? { total: 0, count: 0 },
    thisQuarter:     thisQuarterAgg[0]  ?? { total: 0, count: 0 },
    lastQuarter:     { total: lastQuarterAgg[0]?.total  ?? 0 },
    sameMonthLastYear: { total: sameMonthLYAgg[0]?.total ?? 0 },
    bestDay:         bestDay    || null,
    todayEntry:      todayEntry || null,
    allDates:        allDatesDocs.map((d) => d.date),
  });
}
