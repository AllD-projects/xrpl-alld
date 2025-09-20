import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '@/lib/auth';
import { sendXRP } from '@/lib/payment';
import {
  SUBSCRIPTION_PLANS,
  getCompanySubscription,
  checkSubscriptionLimits,
  initializeSubscriptionPlans,
  type PlanType
} from '@/lib/subscription-plans';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const me = await requireAuth();

    // COMPANY 권한 확인
    if (me.role !== 'COMPANY') {
      return NextResponse.json(
        { error: 'Company access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action, ...params } = body;

    const company = await prisma.company.findUnique({
      where: { ownerId: me.id },
      include: { wallet: true }
    });

    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }

    switch (action) {
      case 'subscribe': {
        const { planName } = params;

        if (!['Pro', 'Enterprise'].includes(planName)) {
          return NextResponse.json(
            { error: 'Invalid plan name' },
            { status: 400 }
          );
        }

        // 이미 활성 구독이 있는지 확인
        const currentSub = await getCompanySubscription(company.id);
        if (currentSub.hasActiveSubscription) {
          return NextResponse.json(
            { error: 'Company already has an active subscription' },
            { status: 400 }
          );
        }

        // 플랜 조회
        const plan = await prisma.plan.findUnique({
          where: { name: planName }
        });

        if (!plan) {
          return NextResponse.json(
            { error: 'Subscription plan not found' },
            { status: 404 }
          );
        }

        // GlobalConfig에서 Admin 지갑 정보 조회
        const globalConfig = await prisma.globalConfig.findFirst({
          include: { adminIssuerWallet: true }
        });

        if (!globalConfig?.adminIssuerWallet || !company.wallet?.seedCipher) {
          return NextResponse.json(
            { error: 'Payment configuration error' },
            { status: 500 }
          );
        }

        // 구독 결제 처리 (Company → Admin)
        let paymentResult: any;
        try {
          paymentResult = await sendXRP(
            company.wallet.seedCipher,
            globalConfig.adminIssuerWallet.seedCipher,
            plan.priceDrops
          );
          // sendXRP 함수 내부에서 이미 성공 여부를 확인하므로 여기까지 오면 성공
        } catch (error: any) {
          console.error('Subscription payment failed:', error);
          return NextResponse.json(
            { error: error.message || 'Payment processing failed' },
            { status: 400 }
          );
        }

        const txHash = paymentResult.result?.hash || paymentResult.result?.tx_json?.hash;
        if (!txHash) {
          return NextResponse.json(
            { error: 'Payment transaction failed' },
            { status: 500 }
          );
        }

        // 구독 생성
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1); // 1개월 후

        const subscription = await prisma.subscription.create({
          data: {
            companyId: company.id,
            planId: plan.id,
            status: 'ACTIVE',
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            lastPaymentTxHash: txHash
          },
          include: {
            plan: true
          }
        });

        return NextResponse.json({
          success: true,
          subscription: subscription,
          paymentTxHash: txHash,
          message: `Successfully subscribed to ${planName} plan`
        });
      }

      case 'upgrade': {
        const { newPlanName } = params;

        if (!['Pro', 'Enterprise'].includes(newPlanName)) {
          return NextResponse.json(
            { error: 'Invalid plan name' },
            { status: 400 }
          );
        }

        const currentSub = await getCompanySubscription(company.id);
        if (!currentSub.hasActiveSubscription) {
          return NextResponse.json(
            { error: 'No active subscription to upgrade' },
            { status: 400 }
          );
        }

        if (currentSub.plan?.name === newPlanName) {
          return NextResponse.json(
            { error: 'Already on the requested plan' },
            { status: 400 }
          );
        }

        // Pro → Enterprise만 허용
        if (currentSub.plan?.name === 'Enterprise') {
          return NextResponse.json(
            { error: 'Cannot downgrade from Enterprise to Pro' },
            { status: 400 }
          );
        }

        const newPlan = await prisma.plan.findUnique({
          where: { name: newPlanName }
        });

        if (!newPlan) {
          return NextResponse.json(
            { error: 'New plan not found' },
            { status: 404 }
          );
        }

        // 차액 계산 (일할 계산)
        const currentPlanPrice = parseInt(currentSub.plan!.priceDrops);
        const newPlanPrice = parseInt(newPlan.priceDrops);
        const priceDiff = newPlanPrice - currentPlanPrice;

        const now = new Date();
        const daysRemaining = Math.ceil(
          (currentSub.subscription!.currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        const proratedAmount = Math.floor((priceDiff * daysRemaining) / 30);

        // 차액 결제
        const globalConfig = await prisma.globalConfig.findFirst({
          include: { adminIssuerWallet: true }
        });

        if (proratedAmount > 0 && company.wallet?.seedCipher && globalConfig?.adminIssuerWallet) {
          try {
            const paymentResult = await sendXRP(
              company.wallet.seedCipher,
              globalConfig.adminIssuerWallet.seedCipher,
              proratedAmount.toString()
            );

            const txHash = paymentResult.result?.hash || paymentResult.result?.tx_json?.hash;

            // 구독 업그레이드
            await prisma.subscription.update({
              where: { id: currentSub.subscription!.id },
              data: {
                planId: newPlan.id,
                lastPaymentTxHash: txHash
              }
            });

            return NextResponse.json({
              success: true,
              message: `Successfully upgraded to ${newPlanName}`,
              proratedAmount: proratedAmount,
              paymentTxHash: txHash
            });
          } catch (error) {
            console.error('Upgrade payment failed:', error);
            return NextResponse.json(
              { error: 'Upgrade payment failed' },
              { status: 400 }
            );
          }
        } else {
          // 무료 업그레이드 (차액이 0이거나 음수인 경우)
          await prisma.subscription.update({
            where: { id: currentSub.subscription!.id },
            data: { planId: newPlan.id }
          });

          return NextResponse.json({
            success: true,
            message: `Successfully upgraded to ${newPlanName}`,
            proratedAmount: 0
          });
        }
      }

      case 'cancel': {
        const currentSub = await getCompanySubscription(company.id);
        if (!currentSub.hasActiveSubscription) {
          return NextResponse.json(
            { error: 'No active subscription to cancel' },
            { status: 400 }
          );
        }

        // 구독 취소 (기간 종료까지는 유지)
        await prisma.subscription.update({
          where: { id: currentSub.subscription!.id },
          data: { status: 'CANCELED' }
        });

        return NextResponse.json({
          success: true,
          message: 'Subscription canceled. Access will continue until the end of current period.',
          accessUntil: currentSub.subscription!.currentPeriodEnd
        });
      }

      case 'renew': {
        const currentSub = await getCompanySubscription(company.id);
        if (!currentSub.subscription) {
          return NextResponse.json(
            { error: 'No subscription found' },
            { status: 404 }
          );
        }

        const globalConfig = await prisma.globalConfig.findFirst({
          include: { adminIssuerWallet: true }
        });

        if (!company.wallet?.seedCipher || !globalConfig?.adminIssuerWallet) {
          return NextResponse.json(
            { error: 'Payment configuration error' },
            { status: 500 }
          );
        }

        // 갱신 결제
        try {
          const paymentResult = await sendXRP(
            company.wallet.seedCipher,
            globalConfig.adminIssuerWallet.seedCipher,
            currentSub.plan!.priceDrops
          );

          const txHash = paymentResult.result?.hash || paymentResult.result?.tx_json?.hash;

          // 구독 갱신
          const newPeriodEnd = new Date(currentSub.subscription.currentPeriodEnd);
          newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

          await prisma.subscription.update({
            where: { id: currentSub.subscription.id },
            data: {
              status: 'ACTIVE',
              currentPeriodStart: currentSub.subscription.currentPeriodEnd,
              currentPeriodEnd: newPeriodEnd,
              lastPaymentTxHash: txHash
            }
          });

          return NextResponse.json({
            success: true,
            message: 'Subscription renewed successfully',
            newPeriodEnd: newPeriodEnd,
            paymentTxHash: txHash
          });
        } catch (error) {
          console.error('Renewal payment failed:', error);
          return NextResponse.json(
            { error: 'Renewal payment failed' },
            { status: 400 }
          );
        }
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Subscription API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'plans': {
        // 사용 가능한 플랜 목록 조회 (인증 불필요)
        const plans = await prisma.plan.findMany({
          orderBy: { priceDrops: 'asc' }
        });

        const plansWithFeatures = plans.map(plan => {
          const planKey = plan.name === 'Pro' ? 'PRO' : plan.name === 'Enterprise' ? 'ENTERPRISE' : null;
          const planDetails = planKey ? SUBSCRIPTION_PLANS[planKey as PlanType] : null;

          return {
            ...plan,
            features: planDetails?.features || [],
            limits: planDetails?.limits || {},
            priceXRP: planDetails?.priceXRP || '0'
          };
        });

        return NextResponse.json(plansWithFeatures);
      }

    }

    // 다른 액션들은 인증 필요
    const me = await requireAuth();

    switch (action) {
      case 'status': {
        if (me.role !== 'COMPANY') {
          return NextResponse.json(
            { error: 'Company access required' },
            { status: 403 }
          );
        }

        const company = await prisma.company.findUnique({
          where: { ownerId: me.id }
        });

        if (!company) {
          return NextResponse.json(
            { error: 'Company not found' },
            { status: 404 }
          );
        }

        const subInfo = await getCompanySubscription(company.id);

        return NextResponse.json({
          ...subInfo,
          companyId: company.id
        });
      }

      case 'limits': {
        if (me.role !== 'COMPANY') {
          return NextResponse.json(
            { error: 'Company access required' },
            { status: 403 }
          );
        }

        const company = await prisma.company.findUnique({
          where: { ownerId: me.id }
        });

        if (!company) {
          return NextResponse.json(
            { error: 'Company not found' },
            { status: 404 }
          );
        }

        const productLimits = await checkSubscriptionLimits(company.id, 'create_product');
        const orderLimits = await checkSubscriptionLimits(company.id, 'monthly_orders');

        return NextResponse.json({
          products: productLimits,
          monthlyOrders: orderLimits
        });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action parameter' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Subscription GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}