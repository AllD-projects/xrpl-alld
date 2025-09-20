import { authorizeHolder } from "@/lib/authorizeHolder";
import { faucet } from "@/lib/faucet";
import { prisma } from "@/lib/prisma";
import { createWallet } from "@/lib/wallet";
import { Role, WalletKind } from "@prisma/client";
import bcrypt from "bcrypt";
import { NextResponse } from "next/server";
import { z } from "zod";

export type SignupFormData = {
  email: string;
  password: string;
  displayName: string;
  role: "USER" | "COMPANY";
  companyName?: string;
  passwordConfirm: string;
};

export const signupSchema = z.object({
  email: z.email(),
  password: z.string().min(6),
  displayName: z.string().min(1),
  role: z.enum(["USER", "COMPANY"]),
  companyName: z.string().min(1).optional()
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const body = signupSchema.parse(json);

    if (body.role === "COMPANY" && !body.companyName) {
      return NextResponse.json({ ok: false, error: "companyName is required for COMPANY role" }, { status: 400 });
    }

    const dup = await prisma.account.findUnique({ where: { email: body.email } });
    if (dup) return NextResponse.json({ ok: false, error: "Email already in use" }, { status: 409 });

    const passwordHash = await bcrypt.hash(body.password, 10);

    const account = await prisma.account.create({
      data: {
        email: body.email,
        displayName: body.displayName,
        role: body.role as Role,
        passwordHash
      }
    });

    const w = createWallet();

    await faucet(w.seedPlain);

    const cfg = await prisma.globalConfig.findFirst({ include: { adminIssuerWallet: true } });
    if (cfg?.mptIssuanceId) {
      await authorizeHolder(w.seedPlain, cfg.adminIssuerWallet!.seedCipher!, cfg.mptIssuanceId);
    }

    if (body.role === "USER") {
      const wallet = await prisma.wallet.create({
        data: {
          ownerAccountId: account.id,
          kind: WalletKind.USER,
          classicAddress: w.classicAddress,
          publicKey: w.publicKey,
          seedCipher: w.seedPlain, // ⚠️ 데모 전용(운영 시 암호화 필수)
          label: "User Wallet"
        }
      });

      return NextResponse.json({
        ok: true,
        accountId: account.id,
        role: account.role,
        wallet: { id: wallet.id, address: wallet.classicAddress }
      });
    } else {
      const company = await prisma.company.create({
        data: {
          ownerId: account.id,
          name: body.companyName!
        }
      });

      const wallet = await prisma.wallet.create({
        data: {
          ownerCompanyId: company.id,
          kind: WalletKind.COMPANY,
          classicAddress: w.classicAddress,
          publicKey: w.publicKey,
          seedCipher: w.seedPlain, // ⚠️ 데모 전용(운영 시 암호화 필수)
          label: "Company Wallet"
        }
      });

      return NextResponse.json({
        ok: true,
        accountId: account.id,
        role: account.role,
        company: { id: company.id, name: company.name },
        wallet: { id: wallet.id, address: wallet.classicAddress }
      });
    }
  } catch (err: any) {
    if (err?.issues) {
      return NextResponse.json({ ok: false, error: "Invalid input", details: err.issues }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
