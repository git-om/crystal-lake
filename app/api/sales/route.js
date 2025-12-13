import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Sale from "@/models/Sale";
import { requireUser } from "@/lib/auth";
import { getChicagoTodayISO, isValidISODateString } from "@/lib/time";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  await dbConnect();
  const sales = await Sale.find().sort({ date: -1 });
  return NextResponse.json({ sales, isOwner: user.isOwner });
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
