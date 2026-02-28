import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Sale from "@/models/Sale";
import { requireUser } from "@/lib/auth";
import { getChicagoTodayISO, isValidISODateString, nextMonthStart } from "@/lib/time";

export async function GET(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page  = Math.max(1, parseInt(searchParams.get("page")  || "1",  10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "10", 10)));
  const month = searchParams.get("month") || "all"; // YYYY-MM or "all"

  await dbConnect();

  const filter =
    month !== "all"
      ? { date: { $gte: `${month}-01`, $lt: nextMonthStart(month) } }
      : {};

  const [sales, total] = await Promise.all([
    Sale.find(filter, { _id: 1, date: 1, sale: 1 })
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Sale.countDocuments(filter),
  ]);

  return NextResponse.json({
    sales,
    total,
    pages:   Math.max(1, Math.ceil(total / limit)),
    isOwner: user.isOwner,
  });
}

export async function POST(req) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { date, sale } = await req.json();

  if (!isValidISODateString(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  const saleNum = Number(sale);
  if (!Number.isFinite(saleNum) || saleNum < 0) {
    return NextResponse.json({ error: "Invalid sale amount" }, { status: 400 });
  }

  // No future dates (Chicago)
  const today = getChicagoTodayISO();
  if (date > today) {
    return NextResponse.json({ error: "Future dates are not allowed" }, { status: 400 });
  }

  await dbConnect();

  try {
    const created = await Sale.create({
      date,
      sale: saleNum,
      createdBy: user._id,
    });
    return NextResponse.json({ sale: created }, { status: 201 });
  } catch (e) {
    // Duplicate date (unique index)
    if (String(e?.code) === "11000") {
      return NextResponse.json({ error: "Sales for that date already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
