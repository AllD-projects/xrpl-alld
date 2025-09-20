import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 구독 플랜 정의
export const SUBSCRIPTION_PLANS = {
  PRO: {
    name: 'Pro',
    priceDrops: '50000000', // 50 XRP
    priceXRP: '50',
    interval: 'monthly',
    features: [
      'Up to 100 products',
      'Basic analytics',
      'Standard support',
      'Point system integration',
      'Basic company verification'
    ],
    limits: {
      maxProducts: 100,
      maxMonthlyOrders: 1000,
      analyticsRetention: 30 // days
    }
  },
  ENTERPRISE: {
    name: 'Enterprise',
    priceDrops: '150000000', // 150 XRP
    priceXRP: '150',
    interval: 'monthly',
    features: [
      'Unlimited products',
      'Advanced analytics',
      'Priority support',
      'Point system integration',
      'Advanced company verification',
      'Custom integrations',
      'White-label options',
      'Dedicated account manager'
    ],
    limits: {
      maxProducts: -1, // unlimited
      maxMonthlyOrders: -1, // unlimited
      analyticsRetention: 365 // days
    }
  }
} as const;

export type PlanType = keyof typeof SUBSCRIPTION_PLANS;

/**
 * 기본 구독 플랜들을 데이터베이스에 생성/업데이트
 */
export async function initializeSubscriptionPlans() {
  console.log('🔄 Initializing subscription plans...');

  for (const [planKey, planData] of Object.entries(SUBSCRIPTION_PLANS)) {
    try {
      await prisma.plan.upsert({
        where: { name: planData.name },
        update: {
          priceDrops: planData.priceDrops,
          interval: planData.interval
        },
        create: {
          name: planData.name,
          priceDrops: planData.priceDrops,
          interval: planData.interval
        }
      });

      console.log(`✅ Plan initialized: ${planData.name}`);
    } catch (error) {
      console.error(`❌ Failed to initialize plan ${planData.name}:`, error);
    }
  }

  console.log('🎉 Subscription plans initialization complete');
}

/**
 * 회사의 현재 구독 상태 확인
 */
export async function getCompanySubscription(companyId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: {
      companyId: companyId,
      status: 'ACTIVE'
    },
    include: {
      plan: true,
      company: true
    },
    orderBy: {
      currentPeriodEnd: 'desc'
    }
  });

  if (!subscription) {
    return {
      hasActiveSubscription: false,
      plan: null,
      subscription: null,
      isExpired: true
    };
  }

  const now = new Date();
  const isExpired = subscription.currentPeriodEnd < now;

  return {
    hasActiveSubscription: !isExpired,
    plan: subscription.plan,
    subscription: subscription,
    isExpired: isExpired,
    daysRemaining: Math.ceil((subscription.currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  };
}

/**
 * 구독 플랜의 기능 제한 확인
 */
export async function checkSubscriptionLimits(companyId: string, action: string, currentCount?: number) {
  const subInfo = await getCompanySubscription(companyId);

  if (!subInfo.hasActiveSubscription) {
    return {
      allowed: false,
      reason: 'No active subscription',
      upgradeRequired: true
    };
  }

  const planLimits = SUBSCRIPTION_PLANS[subInfo.plan?.name as PlanType]?.limits;

  if (!planLimits) {
    return {
      allowed: false,
      reason: 'Invalid subscription plan'
    };
  }

  switch (action) {
    case 'create_product':
      if (planLimits.maxProducts === -1) return { allowed: true };

      const productCount = await prisma.product.count({
        where: { companyId: companyId, active: true }
      });

      return {
        allowed: productCount < planLimits.maxProducts,
        reason: productCount >= planLimits.maxProducts ? `Product limit reached (${planLimits.maxProducts})` : undefined,
        current: productCount,
        limit: planLimits.maxProducts
      };

    case 'monthly_orders':
      if (planLimits.maxMonthlyOrders === -1) return { allowed: true };

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const monthlyOrders = await prisma.order.count({
        where: {
          product: { companyId: companyId },
          createdAt: { gte: startOfMonth }
        }
      });

      return {
        allowed: monthlyOrders < planLimits.maxMonthlyOrders,
        reason: monthlyOrders >= planLimits.maxMonthlyOrders ? `Monthly order limit reached (${planLimits.maxMonthlyOrders})` : undefined,
        current: monthlyOrders,
        limit: planLimits.maxMonthlyOrders
      };

    default:
      return { allowed: true };
  }
}

/**
 * 구독 만료 알림이 필요한 회사들 조회
 */
export async function getSubscriptionsNearExpiry(daysAhead: number = 7) {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysAhead);

  return await prisma.subscription.findMany({
    where: {
      status: 'ACTIVE',
      currentPeriodEnd: {
        lte: targetDate,
        gte: new Date()
      }
    },
    include: {
      company: true,
      plan: true
    }
  });
}