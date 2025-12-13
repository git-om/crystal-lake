import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { dbConnect } from "@/lib/db";
import User from "@/models/User";
import { attachSessionCookie, signSession } from "@/lib/auth";

export async function POST(req) {
  const { username, password } = await req.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  await dbConnect();
  const user = await User.findOne({ username: username.toLowerCase().trim() });
  if (!user) return NextResponse.json({ error: "Invalid login" }, { status: 401 });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return NextResponse.json({ error: "Invalid login" }, { status: 401 });

  const token = await signSession({
    sub: String(user._id),
    username: user.username,
    name: user.name,
    isOwner: user.isOwner,
  });

  const res = NextResponse.json({ ok: true });
  return attachSessionCookie(res, token);
}
