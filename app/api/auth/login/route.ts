import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcrypt";
import { signJwt } from "@/lib/jwt";

const schema = z.object({
    email: z.email(),
    password: z.string().min(1),
});

export async function POST(req: Request) {
    try {
        const body = schema.parse(await req.json());
        const user = await prisma.account.findUnique({ where: { email: body.email } });
        if (!user) {
            return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
        }

        const ok = await bcrypt.compare(body.password, user.passwordHash);
        if (!ok) {
            return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
        }

        const token = await signJwt({ sub: user.id, role: user.role as any, email: user.email });

        const res = NextResponse.json({
            ok: true,
            me: { id: user.id, email: user.email, role: user.role, displayName: user.displayName },
        });

        res.cookies.set("auth_token", token, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            // 만료 지정 없음 → 브라우저 세션 쿠키 (JWT 자체는 exp 없이 무기한)
        });

        // 마지막 로그인 기록(실패해도 무시)
        prisma.account.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {});

        return res;
    } catch (err: any) {
        if (err?.issues) {
            return NextResponse.json({ ok: false, error: "Invalid input", details: err.issues }, { status: 400 });
        }
        return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
    }
}