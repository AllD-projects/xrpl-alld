import { PrismaClient } from '@prisma/client';
import { releaseEscrowedPoints } from './escrow';

const prisma = new PrismaClient();

/**
 * 만료된 에스크로를 자동으로 해제하는 스케줄러
 * (cron job으로 주기적 실행)
 */
export async function processExpiredEscrows() {
  console.log('🔄 Processing expired escrows...');

  const now = new Date();

  // 해제 가능한 에스크로 조회
  const readyEscrows = await prisma.pointEscrow.findMany({
    where: {
      status: 'CREATED',
      finishAfter: { lte: now }
    },
    include: {
      account: { include: { wallet: true } },
      order: { include: { product: true } }
    }
  });

  console.log(`Found ${readyEscrows.length} escrows ready for release`);

  const globalConfig = await prisma.globalConfig.findFirst({
    include: { adminIssuerWallet: true }
  });

  if (!globalConfig?.adminIssuerWallet?.seedCipher || !globalConfig.mptIssuanceId) {
    console.error('❌ Global config not found');
    return;
  }

  let processed = 0;
  let failed = 0;

  for (const escrow of readyEscrows) {
    try {
      const [, sequence] = (escrow.createTx || ':').split(':');
      const escrowSequence = parseInt(sequence);

      // 에스크로 해제
      const result = await releaseEscrowedPoints(
        globalConfig.adminIssuerWallet.seedCipher,
        escrow.issuer,
        escrowSequence,
        globalConfig.mptIssuanceId
      );

      // DB 업데이트
      await prisma.$transaction(async (tx) => {
        await tx.pointEscrow.update({
          where: { id: escrow.id },
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
            issuer: globalConfig.adminIssuerWallet!.classicAddress,
            note: `Auto-released points from escrow ${escrow.id}`
          }
        });

        // 주문이 있다면 상태 업데이트
        if (escrow.orderId) {
          await tx.order.update({
            where: { id: escrow.orderId },
            data: { status: 'RELEASED' }
          });
        }
      });

      processed++;
      console.log(`✅ Released escrow ${escrow.id}: ${escrow.amountStr} points`);

    } catch (error) {
      failed++;
      console.error(`❌ Failed to release escrow ${escrow.id}:`, error);
    }
  }

  console.log(`🎉 Escrow processing complete: ${processed} processed, ${failed} failed`);

  return {
    total: readyEscrows.length,
    processed,
    failed
  };
}

/**
 * 환불 기간이 만료된 주문들의 상태를 업데이트
 */
export async function processExpiredOrders() {
  console.log('🔄 Processing expired orders...');

  const expiredOrders = await prisma.order.findMany({
    where: {
      status: 'PAID',
      createdAt: {
        lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7일 전
      }
    },
    include: {
      escrows: true,
      product: true
    }
  });

  for (const order of expiredOrders) {
    const orderAge = (Date.now() - order.createdAt.getTime()) / (1000 * 60 * 60 * 24);

    if (orderAge > order.product.returnDays) {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'COMPLETED' }
      });

      await prisma.orderEvent.create({
        data: {
          orderId: order.id,
          type: 'AUTO_COMPLETED',
          note: `Order auto-completed after ${order.product.returnDays} days refund period`
        }
      });

      console.log(`✅ Auto-completed order ${order.id}`);
    }
  }
}

/**
 * 통합 스케줄러 (1시간마다 실행 권장)
 */
export async function runEscrowScheduler() {
  try {
    console.log('🚀 Starting escrow scheduler...');

    const escrowResults = await processExpiredEscrows();
    const orderResults = await processExpiredOrders();

    console.log('📊 Scheduler Summary:');
    console.log(`   Escrows: ${escrowResults.processed} released`);
    console.log(`   Orders: auto-completed`);

    return {
      success: true,
      escrows: escrowResults
    };
  } catch (error) {
    console.error('❌ Escrow scheduler failed:', error);
    return {
      success: false,
      error: error
    };
  }
}