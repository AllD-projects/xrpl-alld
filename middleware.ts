// /middleware.ts
import { verifyJwt } from "@/lib/jwt"; // jose 기반
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = ["/", "/login", "/signup"];
const PUBLIC_API_PREFIXES = ["/api/auth", "/_next", "/favicon", "/public", "/api/admin/init"];

function deny(req: NextRequest, status = 401) {
  const isApi = req.nextUrl.pathname.startsWith("/api/");
  if (isApi) {
    return new NextResponse(
      JSON.stringify({
        ok: false,
        error: status === 403 ? "Forbidden" : "Unauthorized"
      }),
      { status, headers: { "content-type": "application/json" } }
    );
  }
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublicPage = PUBLIC_PATHS.includes(pathname);
  const isPublicApi = PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));
  if (isPublicPage || isPublicApi) return NextResponse.next();

    const needAuth =
        pathname.startsWith("/user") ||
        pathname.startsWith("/company") ||
        pathname.startsWith("/admin") ||
        pathname.startsWith("/api/company") ||
        pathname.startsWith("/api/products") ||
        pathname.startsWith("/api/admin");

  if (!needAuth) return NextResponse.next();

  const token = req.cookies.get("auth_token")?.value;
  console.log("Middleware - pathname:", pathname, "token:", token ? "exists" : "missing");

  if (!token) {
    console.log("Middleware - No token, redirecting to login");
    return deny(req, 401);
  }

  try {
    const payload = await verifyJwt(token);
    console.log("Middleware - JWT payload:", payload);

    if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
      if (payload.role !== "ADMIN") return deny(req, 403);
    }
    if (pathname.startsWith("/company") || pathname.startsWith("/api/company")) {
      if (!["USER", "COMPANY", "ADMIN"].includes(payload.role)) return deny(req, 403);
    }
    console.log("Middleware - Access granted");
    return NextResponse.next();
  } catch (e) {
    console.log("Middleware - JWT verification failed:", e);
    return deny(req, 401);
  }
}

export const config = {
  matcher: [
    "/user/:path*",
    "/company/:path*",
    "/admin/:path*",
    "/api/company/:path*",
    "/api/admin/:path*",
    "/api/products/:path*"
  ]
};
