// /lib/auth.js
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { dbConnect } from "@/lib/db";
import User from "@/models/User";

const COOKIE_NAME = "session";
const secret = new TextEncoder().encode(process.env.JWT_SECRET);

if (!process.env.JWT_SECRET) throw new Error("Missing JWT_SECRET in .env.local");

export async function signSession(payload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifySession(token) {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies(); // ✅ await in Next 16
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return await verifySession(token);
}

// ✅ NEW: attach cookies to a NextResponse (works in route handlers)
export function attachSessionCookie(res, token) {
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

export function attachClearSessionCookie(res) {
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}

export async function requireUser() {
  const session = await getSession();
  if (!session?.sub) return null;

  await dbConnect();
  const user = await User.findById(session.sub).select("-password");
  return user || null;
}

export async function requireOwner() {
  const user = await requireUser();
  if (!user) return { user: null, ok: false };
  return { user, ok: !!user.isOwner };
}
