import { PrismaClient } from '@prisma/client';
import { sendXRP } from './payment';
import { getSubscriptionsNearExpiry } from './subscription-plans';

const prisma = new PrismaClient();

/**
 * 만료된 구독을 처리하는 스케줄러
 */
export async function processExpiredSubscriptions() {
  console.log('🔄 Processing expired subscriptions...');

  const now = new Date();

  // 만료된 구독 조회
  const expiredSubscriptions = await prisma.subscription.findMany({
    where: {
      status: 'ACTIVE',
      currentPeriodEnd: { lt: now }
    },
    include: {
      company: { include: { wallet: true } },
      plan: true
    }
  });

  console.log(`Found ${expiredSubscriptions.length} expired subscriptions`);

  let processed = 0;
  let failed = 0;

  for (const subscription of expiredSubscriptions) {
    try {
      // 구독 상태를 PAST_DUE로 변경
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'PAST_DUE' }
      });

      console.log(`✅ Marked subscription ${subscription.id} as PAST_DUE`);
      processed++;
    } catch (error) {
      console.error(`❌ Failed to process expired subscription ${subscription.id}:`, error);
      failed++;
    }
  }

  console.log(`🎉 Expired subscriptions processing complete: ${processed} processed, ${failed} failed`);

  return { processed, failed };
}

/**
 * 자동 갱신 처리 (회사 지갑에서 Admin으로 자동 결제)
 */
export async function processAutoRenewals() {
  console.log('🔄 Processing auto renewals...');

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  // 내일 만료되는 활성 구독들 조회
  const renewalCandidates = await prisma.subscription.findMany({
    where: {
      status: 'ACTIVE',
      currentPeriodEnd: {
        gte: new Date(),
        lt: tomorrow
      }
    },
    include: {
      company: { include: { wallet: true } },
      plan: true
    }
  });

  console.log(`Found ${renewalCandidates.length} subscriptions ready for auto-renewal`);

  const globalConfig = await prisma.globalConfig.findFirst({
    include: { adminIssuerWallet: true }
  });

  if (!globalConfig?.adminIssuerWallet?.seedCipher) {
    console.error('❌ Global config or admin wallet not found');
    return { processed: 0, failed: 0 };
  }

  let processed = 0;
  let failed = 0;

  for (const subscription of renewalCandidates) {
    try {
      // 회사 지갑이 없으면 갱신 실패
      if (!subscription.company.wallet?.seedCipher) {
        console.log(`⚠️ Company ${subscription.companyId} has no wallet, skipping auto-renewal`);
        continue;
      }

      // 자동 갱신 결제 시도
      const paymentResult = await sendXRP(
        subscription.company.wallet.seedCipher,
        globalConfig.adminIssuerWallet.seedCipher,
        subscription.plan.priceDrops
      );

      const txHash = paymentResult.result?.hash || paymentResult.result?.tx_json?.hash;

      if (!txHash) {
        throw new Error('Payment transaction failed');
      }

      // 구독 기간 연장
      const newPeriodStart = subscription.currentPeriodEnd;
      const newPeriodEnd = new Date(subscription.currentPeriodEnd);
      newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          currentPeriodStart: newPeriodStart,
          currentPeriodEnd: newPeriodEnd,
          lastPaymentTxHash: txHash
        }
      });

      console.log(`✅ Auto-renewed subscription ${subscription.id} for company ${subscription.company.name}`);
      processed++;

    } catch (error) {
      console.error(`❌ Failed to auto-renew subscription ${subscription.id}:`, error);

      // 자동 갱신 실패 시 PAST_DUE로 마킹
      try {
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: 'PAST_DUE' }
        });
      } catch (updateError) {
        console.error(`❌ Failed to mark subscription ${subscription.id} as PAST_DUE:`, updateError);
      }

      failed++;
    }
  }

  console.log(`🎉 Auto-renewals processing complete: ${processed} processed, ${failed} failed`);

  return { processed, failed };
}

/**
 * 구독 만료 알림 (7일, 3일, 1일 전)
 */
export async function sendExpiryNotifications() {
  console.log('🔄 Sending expiry notifications...');

  const notifications = [
    { days: 7, type: 'WEEK_BEFORE' },
    { days: 3, type: 'THREE_DAYS_BEFORE' },
    { days: 1, type: 'ONE_DAY_BEFORE' }
  ];

  let totalSent = 0;

  for (const notification of notifications) {
    const subscriptions = await getSubscriptionsNearExpiry(notification.days);

    for (const subscription of subscriptions) {
      try {
        // 실제 환경에서는 이메일/SMS 발송
        console.log(`📧 Notification sent to ${subscription.company.name}: ${notification.type}`);
        console.log(`   Plan: ${subscription.plan.name}`);
        console.log(`   Expires: ${subscription.currentPeriodEnd.toISOString()}`);

        // 알림 로그 저장 (선택사항)
        // await prisma.notificationLog.create({...});

        totalSent++;
      } catch (error) {
        console.error(`❌ Failed to send notification to company ${subscription.companyId}:`, error);
      }
    }
  }

  console.log(`🎉 Notifications sent: ${totalSent} total`);

  return { sent: totalSent };
}

/**
 * 과거 연체 상태인 구독들을 취소 처리
 */
export async function cancelPastDueSubscriptions(gracePeriodDays: number = 7) {
  console.log('🔄 Canceling past due subscriptions...');

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - gracePeriodDays);

  const pastDueSubscriptions = await prisma.subscription.findMany({
    where: {
      status: 'PAST_DUE',
      currentPeriodEnd: { lt: cutoffDate }
    },
    include: {
      company: true,
      plan: true
    }
  });

  console.log(`Found ${pastDueSubscriptions.length} past due subscriptions to cancel`);

  let canceled = 0;

  for (const subscription of pastDueSubscriptions) {
    try {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'CANCELED' }
      });

      console.log(`✅ Canceled past due subscription ${subscription.id} for ${subscription.company.name}`);
      canceled++;
    } catch (error) {
      console.error(`❌ Failed to cancel subscription ${subscription.id}:`, error);
    }
  }

  console.log(`🎉 Past due cancellations complete: ${canceled} canceled`);

  return { canceled };
}

/**
 * 구독 관리 통합 스케줄러 (매일 실행 권장)
 */
export async function runSubscriptionScheduler() {
  try {
    console.log('🚀 Starting subscription scheduler...');

    const [
      expiredResults,
      renewalResults,
      notificationResults,
      cancellationResults
    ] = await Promise.all([
      processExpiredSubscriptions(),
      processAutoRenewals(),
      sendExpiryNotifications(),
      cancelPastDueSubscriptions()
    ]);

    console.log('📊 Subscription Scheduler Summary:');
    console.log(`   Expired: ${expiredResults.processed} processed`);
    console.log(`   Auto-renewals: ${renewalResults.processed} processed`);
    console.log(`   Notifications: ${notificationResults.sent} sent`);
    console.log(`   Cancellations: ${cancellationResults.canceled} canceled`);

    return {
      success: true,
      results: {
        expired: expiredResults,
        renewals: renewalResults,
        notifications: notificationResults,
        cancellations: cancellationResults
      }
    };
  } catch (error) {
    console.error('❌ Subscription scheduler failed:', error);
    return {
      success: false,
      error: error
    };
  }
}