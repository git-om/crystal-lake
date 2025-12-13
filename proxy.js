import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

async function readSession(req) {
  const token = req.cookies.get("session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

export default async function proxy(req) {
  const { pathname } = req.nextUrl;

  // Public routes
  const isPublic =
    pathname === "/login" ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/logout") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico";

  const session = await readSession(req);

  // If logged in, keep them out of /login
  if (pathname === "/login" && session) {
    const url = req.nextUrl.clone();
    url.pathname = "/sales";
    return NextResponse.redirect(url);
  }

  if (isPublic) return NextResponse.next();

  // Protect everything else
  if (!session) {
    // For API requests, return 401 instead of redirect
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|css|js)$).*)",
  ],
};

