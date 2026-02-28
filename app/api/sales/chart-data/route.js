import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Sale from "@/models/Sale";
import { requireOwner } from "@/lib/auth";

export async function GET() {
  const { user, ok } = await requireOwner();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!ok)   return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await dbConnect();

  const [allEntriesRaw, dowAgg] = await Promise.all([
    // All entries — only 2 lightweight fields. Index scan on date: 1.
    // Each {date, sale} is ~25 bytes; 3 years of daily data ≈ 25 KB.
    Sale.find({}, { date: 1, sale: 1, _id: 0 }).sort({ date: 1 }).lean(),

    // Day-of-week averages across ALL historical data (Chicago timezone).
    // $dateFromString + $dayOfWeek is a single aggregation pass — O(n).
    Sale.aggregate([
      {
        $addFields: {
          dateObj: {
            $dateFromString: {
              dateString: "$date",
              format: "%Y-%m-%d",
              timezone: "America/Chicago",
            },
          },
        },
      },
      {
        $addFields: {
          // $dayOfWeek returns 1=Sun…7=Sat; subtract 1 → 0=Sun…6=Sat
          dow: {
            $subtract: [
              { $dayOfWeek: { date: "$dateObj", timezone: "America/Chicago" } },
              1,
            ],
          },
        },
      },
      { $group: { _id: "$dow", total: { $sum: "$sale" }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  // Build 7-slot DOW array with avg per day of week
  const dowAverages = Array.from({ length: 7 }, (_, i) => {
    const found = dowAgg.find((d) => d._id === i);
    return {
      dow:   i,
      avg:   found ? +(found.total / found.count).toFixed(2) : 0,
      count: found?.count ?? 0,
    };
  });

  return NextResponse.json({
    // allEntries sorted ASC: client slices/filters for every chart — no extra queries needed.
    allEntries: allEntriesRaw,
    // Server-computed DOW averages from ALL data — used by forecast algorithm for seasonal factors.
    dowAverages,
  });
}
