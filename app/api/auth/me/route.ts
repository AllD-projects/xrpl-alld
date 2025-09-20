import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt } from "@/lib/jwt";
import '@/lib/server-init'; // 서버 초기화

export async function GET(req: Request) {
    try {
        const token = (req as any).cookies?.get?.("auth_token")?.value
            ?? (globalThis as any).cookies?.get?.("auth_token")?.value; // 일부 런타임 호환

        // App Router의 표준 쿠키 접근
        let auth = token;
        if (!auth) {
            const { cookies } = await import("next/headers");
            auth = (await cookies()).get("auth_token")?.value;
        }
        if (!auth) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

        const payload = verifyJwt(auth);
        const user = await prisma.account.findUnique({ where: { id: payload.sub } });
        if (!user) return NextResponse.json({ ok: false, error: "Account not found" }, { status: 401 });

        return NextResponse.json({
            ok: true,
            me: { id: user.id, email: user.email, role: user.role, displayName: user.displayName },
        });
    } catch {
        return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
    }
}
