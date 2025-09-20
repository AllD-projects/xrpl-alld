import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '@/lib/auth';
import { finishMPTEscrow } from '@/lib/escrow';
import { Client, Wallet } from 'xrpl';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const me = await requireAuth();
    const body = await request.json();
    const { escrowId } = body;

    if (!escrowId) {
      return NextResponse.json(
        { error: 'Escrow ID is required' },
        { status: 400 }
      );
    }

    // 에스크로 조회
    const escrow = await prisma.pointEscrow.findUnique({
      where: { id: escrowId },
      include: {
        account: { include: { wallet: true } },
        order: true
      }
    });

    if (!escrow) {
      return NextResponse.json(
        { error: 'Escrow not found' },
        { status: 404 }
      );
    }

    if (escrow.status !== 'CREATED') {
      return NextResponse.json(
        { error: `Escrow already processed with status: ${escrow.status}` },
        { status: 400 }
      );
    }

    // 글로벌 설정 조회
    const globalConfig = await prisma.globalConfig.findFirst({
      include: { adminIssuerWallet: true }
    });

    if (!globalConfig?.adminIssuerWallet?.seedCipher || !globalConfig.mptIssuanceId) {
      return NextResponse.json(
        { error: 'System configuration error' },
        { status: 500 }
      );
    }

    // 에스크로 트랜잭션 정보 파싱
    const [, sequence] = (escrow.createTx || ':').split(':');
    const escrowSequence = parseInt(sequence);

    if (!escrowSequence || isNaN(escrowSequence)) {
      // 시퀀스가 없으면 직접 완료 처리
      await prisma.$transaction(async (tx) => {
        await tx.pointEscrow.update({
          where: { id: escrowId },
          data: {
            status: 'RELEASED',
            finishTx: 'MANUAL_FINISH_NO_SEQUENCE'
          }
        });

        await tx.pointLedger.create({
          data: {
            accountId: escrow.accountId,
            type: 'EARN',
            amount: escrow.amountStr,
            mptCode: globalConfig.mptCode,
            issuer: globalConfig.adminIssuerWallet!.classicAddress,
            note: `Manual finish - no sequence for escrow ${escrowId}`
          }
        });

        if (escrow.orderId) {
          await tx.order.update({
            where: { id: escrow.orderId },
            data: { status: 'RELEASED' }
          });
        }
      });

      return NextResponse.json({
        success: true,
        message: 'Escrow finished manually (no sequence)',
        escrowId: escrowId,
        amount: escrow.amountStr
      });
    }

    // XRPL에서 에스크로 완료
    const client = new Client(process.env.XRPL_RPC_URL || 'wss://s.altnet.rippletest.net:51233');

    try {
      await client.connect();
      const releaserWallet = Wallet.fromSeed(globalConfig.adminIssuerWallet.seedCipher);

      const result = await finishMPTEscrow(
        client,
        releaserWallet,
        escrow.issuer,
        escrowSequence,
        globalConfig.mptIssuanceId
      );

      // DB 업데이트
      await prisma.$transaction(async (tx) => {
        await tx.pointEscrow.update({
          where: { id: escrowId },
          data: {
            status: 'RELEASED',
            finishTx: result.txHash
          }
        });

        await tx.pointLedger.create({
          data: {
            accountId: escrow.accountId,
            type: 'EARN',
            amount: escrow.amountStr,
            mptCode: globalConfig.mptCode,
            issuer: globalConfig.adminIssuerWallet.classicAddress,
            note: `Manual finish for escrow ${escrowId}`
          }
        });

        if (escrow.orderId) {
          await tx.order.update({
            where: { id: escrow.orderId },
            data: { status: 'RELEASED' }
          });
        }
      });

      return NextResponse.json({
        success: true,
        message: 'Escrow finished successfully',
        escrowId: escrowId,
        txHash: result.txHash,
        amount: escrow.amountStr
      });

    } finally {
      await client.disconnect();
    }

  } catch (error) {
    console.error('Escrow finish error:', error);

    // 에스크로가 이미 처리된 경우 graceful handling
    if (error instanceof Error && error.message.includes('Escrow not found')) {
      console.log(`⚠️ Escrow ${escrowId} not found on chain - marking as released`);

      const globalConfig = await prisma.globalConfig.findFirst({
        include: { adminIssuerWallet: true }
      });

      const escrow = await prisma.pointEscrow.findUnique({
        where: { id: escrowId }
      });

      if (escrow && globalConfig?.adminIssuerWallet) {
        await prisma.$transaction(async (tx) => {
          await tx.pointEscrow.update({
            where: { id: escrowId },
            data: {
              status: 'RELEASED',
              finishTx: 'ALREADY_PROCESSED_ON_CHAIN'
            }
          });

          await tx.pointLedger.create({
            data: {
              accountId: escrow.accountId,
              type: 'EARN',
              amount: escrow.amountStr,
              mptCode: globalConfig.mptCode,
              issuer: globalConfig.adminIssuerWallet.classicAddress,
              note: `Manual finish - escrow ${escrowId} was already processed`
            }
          });

          if (escrow.orderId) {
            await tx.order.update({
              where: { id: escrow.orderId },
              data: { status: 'RELEASED' }
            });
          }
        });

        return NextResponse.json({
          success: true,
          message: 'Escrow was already processed on chain - marked as released',
          escrowId: escrowId,
          amount: escrow.amountStr
        });
      }
    }

    return NextResponse.json(
      { error: 'Failed to finish escrow: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const me = await requireAuth();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'CREATED';

    // 에스크로 목록 조회
    const escrows = await prisma.pointEscrow.findMany({
      where: {
        status: status as any
      },
      include: {
        account: {
          select: {
            id: true,
            email: true,
            displayName: true
          }
        },
        order: {
          select: {
            id: true,
            totalDrops: true,
            status: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 50
    });

    return NextResponse.json({
      success: true,
      escrows: escrows,
      count: escrows.length
    });

  } catch (error) {
    console.error('Escrow list error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch escrows' },
      { status: 500 }
    );
  }
}