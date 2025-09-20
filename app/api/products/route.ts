import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {requireAuth, requireCompanyOwner} from "@/lib/auth";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs"; // 파일 시스템 사용

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILES = 8;

export async function POST(req: Request) {
    try {
        const { company } = await requireCompanyOwner();
        if (!company) {
            return NextResponse.json({ ok: false, error: "No company bound to this account" }, { status: 400 });
        }

        const contentType = req.headers.get("content-type") || "";
        if (!contentType.includes("multipart/form-data")) {
            return NextResponse.json({ ok: false, error: "Use multipart/form-data" }, { status: 415 });
        }

        const form = await req.formData();

        // ---- 필드 추출 ----
        const title = (form.get("title") as string | null)?.trim();
        const description = (form.get("description") as string | null)?.trim() ?? undefined;
        const priceDrops = (form.get("priceDrops") as string | null)?.trim();
        const returnDaysRaw = (form.get("returnDays") as string | null)?.trim();
        const activeRaw = (form.get("active") as string | null)?.trim(); // "true"/"false" 허용

        if (!title) return NextResponse.json({ ok: false, error: "title is required" }, { status: 400 });
        if (!priceDrops || !/^\d+$/.test(priceDrops)) {
            return NextResponse.json({ ok: false, error: "priceDrops must be a numeric string (drops)" }, { status: 400 });
        }
        if (!returnDaysRaw || !/^\d+$/.test(returnDaysRaw)) {
            return NextResponse.json({ ok: false, error: "returnDays must be an integer string" }, { status: 400 });
        }
        const returnDays = parseInt(returnDaysRaw, 10);
        if (returnDays < 0 || returnDays > 365) {
            return NextResponse.json({ ok: false, error: "returnDays must be between 0 and 365" }, { status: 400 });
        }
        const active = activeRaw ? activeRaw.toLowerCase() === "true" : true;

        // ---- 이미지들 추출 ----
        const files = form.getAll("files");
        if (files.length > MAX_FILES) {
            return NextResponse.json({ ok: false, error: `Too many files (max ${MAX_FILES})` }, { status: 400 });
        }

        // ---- 트랜잭션: 상품 생성 먼저 ----
        const product = await prisma.product.create({
            data: {
                companyId: company.id,
                title,
                description,
                priceDrops,
                returnDays,
                active,
            },
        });

        // ---- 디렉토리 준비 ----
        const baseDir = path.join(process.cwd(), "public", "uploads", "products", product.id);
        await mkdir(baseDir, { recursive: true });

        // 현재 최대 position
        const last = await prisma.productImage.findFirst({
            where: { productId: product.id },
            orderBy: { position: "desc" },
            select: { position: true },
        });
        let pos = (last?.position ?? -1) + 1;

        const savedImages: { id: string; path: string; position: number }[] = [];

        // ---- 파일 저장 + DB 기록 ----
        for (const entry of files) {
            if (!(entry instanceof File)) continue; // 잘못된 파트 무시

            if (!ALLOWED.has(entry.type)) {
                return NextResponse.json({ ok: false, error: `Unsupported type: ${entry.type}` }, { status: 400 });
            }
            if (entry.size > MAX_SIZE) {
                return NextResponse.json({ ok: false, error: `File too large: ${entry.name}` }, { status: 400 });
            }

            const ext = entry.type === "image/png" ? "png" : entry.type === "image/webp" ? "webp" : "jpg";
            const filename = `${randomUUID()}.${ext}`;
            const filePathDisk = path.join(baseDir, filename);
            const publicPath = `/uploads/products/${product.id}/${filename}`;

            const buf = Buffer.from(await entry.arrayBuffer());
            await writeFile(filePathDisk, buf);

            const rec = await prisma.productImage.create({
                data: { productId: product.id, path: publicPath, position: pos++ },
            });
            savedImages.push({ id: rec.id, path: publicPath, position: rec.position });
        }

        return NextResponse.json({
            ok: true,
            product: {
                id: product.id,
                title: product.title,
                description: product.description,
                priceDrops: product.priceDrops,
                returnDays: product.returnDays,
                active: product.active,
            },
            images: savedImages,
        });
    } catch (err: any) {
        const msg = err?.message || "Unknown error";
        const code =
            msg === "UNAUTHORIZED" ? 401 :
                msg === "FORBIDDEN" ? 403 :
                    500;
        return NextResponse.json({ ok: false, error: msg }, { status: code });
    }
}

export async function GET() {
    try {
        const me = await requireAuth();

        const products = await prisma.product.findMany({
            orderBy: {createdAt: "desc"},
            include: {images: true, credential: true},
        });
        return NextResponse.json({ok: true, products});
    } catch (err: any) {
        const msg = err?.message;
        const code = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
        return NextResponse.json({ok: false, error: msg ?? "Unknown error"}, {status: code});
    }
}