import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };
export async function GET(_req: Request, context: Params) {
    try {
        const { id } = await context.params;

        const product = await prisma.product.findUnique({
            where: { id: id },
            include: {
                images: { orderBy: { position: "asc" } },
                company: true,
                credential: true,
            },
        });
        if (!product) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
        return NextResponse.json({ ok: true, product });
    } catch (err: any) {
        return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
    }
}
