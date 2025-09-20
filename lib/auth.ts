import { cookies } from "next/headers";
import { verifyJwt } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import {Account} from "@prisma/client";

export async function requireAuth(): Promise<Account> {
    const token = (await cookies()).get("auth_token")?.value;
    if (!token) throw new Error("UNAUTHORIZED");
    const payload = await verifyJwt(token);
    const me = await prisma.account.findUnique({ where: { id: payload.sub }});
    if (!me) throw new Error("UNAUTHORIZED");
    return me;
}

export async function requireCompanyOwner() {
    const me = await requireAuth();
    if (me.role !== "COMPANY" && me.role !== "ADMIN") throw new Error("FORBIDDEN");
    // 회사 소유자 회사 조회 (ADMIN인 경우엔 모든 회사 생성 가능하도록 확장 가능)
    const company = await prisma.company.findFirst({ where: { ownerId: me.id }});
    if (!company && me.role !== "ADMIN") throw new Error("NO_COMPANY");
    return { me, company }; // ADMIN이면 company가 null일 수 있음
}
