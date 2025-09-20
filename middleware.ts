// /middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyJwt } from "@/lib/jwt"; // jose 기반

const PUBLIC_PATHS = ["/", "/login", "/signup"];
const PUBLIC_API_PREFIXES = ["/api/auth", "/_next", "/favicon", "/public", "/api/admin/init"];

function deny(req: NextRequest, status = 401) {
    const isApi = req.nextUrl.pathname.startsWith("/api/");
    if (isApi) {
        return new NextResponse(JSON.stringify({
            ok: false, error: status === 403 ? "Forbidden" : "Unauthorized"
        }), { status, headers: { "content-type": "application/json" }});
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
        pathname.startsWith("/api/products")
        pathname.startsWith("/api/admin");

    if (!needAuth) return NextResponse.next();

    const token = req.cookies.get("auth_token")?.value;
    if (!token) return deny(req, 401);

    try {
        const payload = await verifyJwt(token);
        if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
            if (payload.role !== "ADMIN") return deny(req, 403);
        }
        if (pathname.startsWith("/company") || pathname.startsWith("/api/company")) {
            if (!["COMPANY", "ADMIN"].includes(payload.role)) return deny(req, 403);
        }
        return NextResponse.next();
    } catch (e) {
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
    ],
};
