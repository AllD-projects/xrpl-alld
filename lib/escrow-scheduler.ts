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
  const utcNow = new Date(now.getTime() + now.getTimezoneOffset() * 60000);

  console.log(`Current time (local): ${now.toISOString()}`);
  console.log(`Current time (UTC): ${utcNow.toISOString()}`);

  // 해제 가능한 에스크로 조회 (UTC 기준)
  const readyEscrows = await prisma.pointEscrow.findMany({
    where: {
      status: 'CREATED',
      finishAfter: { lte: utcNow }
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

      if (!escrowSequence || isNaN(escrowSequence)) {
        console.log(`⚠️ Invalid sequence for escrow ${escrow.id}: ${escrow.createTx}`);

        // 시퀀스가 없으면 직접 포인트 지급
        await prisma.$transaction(async (tx) => {
          await tx.pointEscrow.update({
            where: { id: escrow.id },
            data: {
              status: 'RELEASED',
              finishTx: 'MANUAL_RELEASE'
            }
          });

          await tx.pointLedger.create({
            data: {
              accountId: escrow.accountId,
              type: 'EARN',
              amount: escrow.amountStr,
              mptCode: globalConfig.mptCode,
              issuer: globalConfig.adminIssuerWallet!.classicAddress,
              note: `Manual release - invalid tx sequence for escrow ${escrow.id}`
            }
          });

          if (escrow.orderId) {
            await tx.order.update({
              where: { id: escrow.orderId },
              data: { status: 'RELEASED' }
            });
          }
        });

        processed++;
        console.log(`✅ Manually released escrow ${escrow.id}: ${escrow.amountStr} points (invalid sequence)`);
        continue;
      }

      try {
        // 에스크로 해제 시도
        const result = await releaseEscrowedPoints(
          globalConfig.adminIssuerWallet.seedCipher,
          escrow.issuer,
          escrowSequence,
          globalConfig.mptIssuanceId
        );

        // 성공 시 DB 업데이트
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

          if (escrow.orderId) {
            await tx.order.update({
              where: { id: escrow.orderId },
              data: { status: 'RELEASED' }
            });
          }
        });

        processed++;
        console.log(`✅ Released escrow ${escrow.id}: ${escrow.amountStr} points`);

      } catch (escrowError) {
        // 에스크로가 이미 처리되었거나 찾을 수 없는 경우
        if (escrowError instanceof Error && escrowError.message.includes('Escrow not found')) {
          console.log(`⚠️ Escrow ${escrow.id} not found on chain - marking as released`);

          // 이미 처리된 것으로 간주하고 DB만 업데이트
          await prisma.$transaction(async (tx) => {
            await tx.pointEscrow.update({
              where: { id: escrow.id },
              data: {
                status: 'RELEASED',
                finishTx: 'ALREADY_PROCESSED'
              }
            });

            await tx.pointLedger.create({
              data: {
                accountId: escrow.accountId,
                type: 'EARN',
                amount: escrow.amountStr,
                mptCode: globalConfig.mptCode,
                issuer: globalConfig.adminIssuerWallet!.classicAddress,
                note: `Auto-credited - escrow ${escrow.id} was already processed on chain`
              }
            });

            if (escrow.orderId) {
              await tx.order.update({
                where: { id: escrow.orderId },
                data: { status: 'RELEASED' }
              });
            }
          });

          processed++;
          console.log(`✅ Marked escrow ${escrow.id} as released: ${escrow.amountStr} points`);
        } else {
          // 다른 에러는 재시도하도록 실패로 처리
          throw escrowError;
        }
      }

    } catch (error) {
      failed++;
      console.error(`❌ Failed to process escrow ${escrow.id}:`, error);
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

  const now = new Date();
  const utcNow = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
  const sevenDaysAgoUTC = new Date(utcNow.getTime() - 7 * 24 * 60 * 60 * 1000);

  console.log(`Checking for orders created before: ${sevenDaysAgoUTC.toISOString()} (UTC)`);

  const expiredOrders = await prisma.order.findMany({
    where: {
      status: 'PAID',
      createdAt: {
        lte: sevenDaysAgoUTC // UTC 기준 7일 전
      }
    },
    include: {
      escrows: true,
      product: true
    }
  });

  for (const order of expiredOrders) {
    const orderAge = (utcNow.getTime() - order.createdAt.getTime()) / (1000 * 60 * 60 * 24);

    console.log(`Order ${order.id}: age=${orderAge.toFixed(2)} days, returnDays=${order.product.returnDays}`);

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