import {NextResponse} from "next/server";
import { prisma } from "@/lib/prisma";
import {createCredential} from "@/lib/credential";
import {CompanyVerifyStatus} from "@prisma/client";
import {acceptCredential} from "@/lib/CredentialAccept";

type Params = { params: Promise<{ id: string }> };

export async function POST(
    _req: Request,
    context: Params
) {
    try {
        const { id } = await context.params;
        const companyId = id

        // 1) 회사 + 지갑
        const company = await prisma.company.findUnique({
            where: { id: companyId },
            include: { wallet: true },
        });

        if (!company) {
            return NextResponse.json({ ok: false, error: "Company not found" }, { status: 404 });
        }
        if (!company.wallet?.classicAddress) {
            return NextResponse.json({ ok: false, error: "Company wallet not found" }, { status: 400 });
        }

        const cfg = await prisma.globalConfig.findFirst({
            include: { adminIssuerWallet: true, adminAccount: true },
        });
        if (!cfg?.adminIssuerWallet?.classicAddress || !cfg.adminIssuerWallet.seedCipher) {
            return NextResponse.json({ ok: false, error: "Issuer wallet not initialized" }, { status: 500 });
        }
        const issuerAddr = cfg.adminIssuerWallet.classicAddress;
        const issuerSeed = cfg.adminIssuerWallet.seedCipher;
        const res = await createCredential(company.wallet.seedCipher!, issuerSeed);


        const txHash = res?.tx_json?.TxnSignature as string | undefined;
        if (!txHash || typeof txHash !== "string" || txHash.length === 0) {
            // 필요하면 res 전체를 로깅해서 왜 hash가 없는지 확인
            console.error("createCredential returned no tx hash:", res);
            return NextResponse.json(
                { ok: false, error: "Credential transaction failed (no txHash)" },
                { status: 502 },
            );
        }

        const accepted = await acceptCredential(company.wallet.seedCipher!, issuerSeed);

        await prisma.$transaction([
            prisma.companyCredential.upsert({
                where: { companyId },
                create: {
                    companyId: companyId,
                    issuedBy: issuerAddr,
                    expiresAt: null,
                    active: true,
                    txHash: txHash
                },
                update: {
                    txHash: txHash,
                    issuedBy: issuerAddr,
                    expiresAt: null,
                    active: true,
                }
            }),
            prisma.company.update({
                where: { id: companyId },
                data: {
                    verifyStatus: CompanyVerifyStatus.APPROVED,
                    verifiedAt: new Date(),
                    verifiedById: cfg.adminAccountId,
                },
            }),
        ]);
        return NextResponse.json({
            ok: true,
            companyId,
            txHash,
            status: "APPROVED",
        });
    } catch (err: any) {
        return NextResponse.json(
            { ok: false, error: err?.message ?? "Approve failed" },
            { status: 500 }
        );
    }
}