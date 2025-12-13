import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Sale from "@/models/Sale";
import { requireOwner } from "@/lib/auth";

export async function PATCH(req, ctx) {
  const { ok } = await requireOwner();
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params; // ✅ Next 16: params is Promise

  const { sale } = await req.json();
  const saleNum = Number(sale);
  if (!Number.isFinite(saleNum) || saleNum < 0) {
    return NextResponse.json({ error: "Invalid sale amount" }, { status: 400 });
  }

  await dbConnect();
  const updated = await Sale.findByIdAndUpdate(
    id,
    { $set: { sale: saleNum } }, // date NOT editable by design
    { new: true }
  );

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ sale: updated });
}

export async function DELETE(req, ctx) {
  const { ok } = await requireOwner();
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params; // ✅ Next 16: params is Promise

  await dbConnect();
  const deleted = await Sale.findByIdAndDelete(id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
