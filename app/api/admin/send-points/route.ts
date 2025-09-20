import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '@/lib/auth';
import { sendMPT } from '@/lib/sendMpt';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const me = await requireAuth();

    // 관리자 권한 확인
    if (me.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { recipientEmail, amount, note } = body;

    if (!recipientEmail || !amount) {
      return NextResponse.json(
        { error: 'Recipient email and amount are required' },
        { status: 400 }
      );
    }

    // 수신자 계정 조회
    const recipient = await prisma.account.findUnique({
      where: { email: recipientEmail },
      include: { wallet: true }
    });

    if (!recipient) {
      return NextResponse.json(
        { error: 'Recipient account not found' },
        { status: 404 }
      );
    }

    if (!recipient.wallet?.seedCipher) {
      return NextResponse.json(
        { error: 'Recipient wallet not found' },
        { status: 400 }
      );
    }

    // 글로벌 설정 조회 (발행자 지갑)
    const globalConfig = await prisma.globalConfig.findFirst({
      include: { adminIssuerWallet: true }
    });

    if (!globalConfig?.adminIssuerWallet?.seedCipher || !globalConfig.mptIssuanceId) {
      return NextResponse.json(
        { error: 'System configuration error - admin issuer wallet not found' },
        { status: 500 }
      );
    }

    // MPT 전송 (sendMPT 함수: userSeed, adminSeed, issuanceId, value)
    console.log(`🎁 Sending ${amount} MPT to ${recipientEmail}...`);

    const mptResult = await sendMPT(
      recipient.wallet.seedCipher,
      globalConfig.adminIssuerWallet.seedCipher,
      globalConfig.mptIssuanceId,
      amount
    );

    const txHash = mptResult.result?.tx_json?.TxnSignature as string | undefined;

    if (!txHash || typeof txHash !== "string" || txHash.length === 0) {
      console.error("sendMPT returned no tx hash:", mptResult.result);
      return NextResponse.json(
        { error: "MPT transaction failed (no txHash)" },
        { status: 502 }
      );
    }

    // 포인트 적립 기록
    await prisma.pointLedger.create({
      data: {
        accountId: recipient.id,
        type: 'ADMIN_CREDIT',
        amount: amount,
        mptCode: globalConfig.mptCode || 'MPT',
        issuer: globalConfig.adminIssuerWallet.classicAddress,
        note: note || `Admin sent ${amount} points for testing`,
        txHash: txHash
      }
    });

    console.log(`✅ Successfully sent ${amount} MPT to ${recipient.email}`);

    return NextResponse.json({
      success: true,
      message: `Successfully sent ${amount} MPT to ${recipient.email}`,
      recipient: {
        email: recipient.email,
        displayName: recipient.displayName,
        walletAddress: recipient.wallet.classicAddress
      },
      transaction: {
        amount: amount,
        txHash: txHash,
        issuanceId: globalConfig.mptIssuanceId
      }
    });

  } catch (error) {
    console.error('Send points error:', error);
    return NextResponse.json(
      { error: 'Failed to send points: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const me = await requireAuth();

    // 관리자 권한 확인
    if (me.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    // 최근 포인트 지급 내역 조회
    const recentCredits = await prisma.pointLedger.findMany({
      where: {
        type: 'ADMIN_CREDIT'
      },
      include: {
        account: {
          select: {
            email: true,
            displayName: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 20
    });

    // 글로벌 설정 조회
    const globalConfig = await prisma.globalConfig.findFirst({
      include: { adminIssuerWallet: true }
    });

    return NextResponse.json({
      success: true,
      recentCredits: recentCredits,
      systemInfo: {
        mptIssuanceId: globalConfig?.mptIssuanceId,
        mptCode: globalConfig?.mptCode,
        adminIssuerAddress: globalConfig?.adminIssuerWallet?.classicAddress
      }
    });

  } catch (error) {
    console.error('Get send points history error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch history' },
      { status: 500 }
    );
  }
}