import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifyJwt } from '@/lib/jwt';
import { getCompanySubscription, checkSubscriptionLimits } from '@/lib/subscription-plans';

const prisma = new PrismaClient();

/**
 * 구독 상태 확인 미들웨어
 */
export async function requireActiveSubscription(request: NextRequest): Promise<NextResponse | null> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const userPayload = await verifyJwt(token);

    if (userPayload.role !== 'COMPANY') {
      return NextResponse.json({ error: 'Company access required' }, { status: 403 });
    }

    const company = await prisma.company.findUnique({
      where: { ownerId: userPayload.sub }
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const subInfo = await getCompanySubscription(company.id);

    if (!subInfo.hasActiveSubscription) {
      return NextResponse.json({
        error: 'Active subscription required',
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'This feature requires an active subscription. Please subscribe to continue.',
        redirectTo: '/subscription/plans'
      }, { status: 402 }); // Payment Required
    }

    // 요청 헤더에 회사 정보 추가
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-company-id', company.id);
    requestHeaders.set('x-subscription-plan', subInfo.plan?.name || '');

    return null; // 미들웨어 통과
  } catch (error) {
    console.error('Subscription middleware error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * 특정 기능에 대한 구독 제한 확인
 */
export async function checkFeatureLimit(
  companyId: string,
  feature: string,
  currentCount?: number
): Promise<{ allowed: boolean; error?: NextResponse }> {
  try {
    const limitCheck = await checkSubscriptionLimits(companyId, feature, currentCount);

    if (!limitCheck.allowed) {
      const errorResponse = NextResponse.json({
        error: 'Feature limit exceeded',
        code: 'FEATURE_LIMIT_EXCEEDED',
        reason: limitCheck.reason,
        current: limitCheck.current,
        limit: limitCheck.limit,
        upgradeRequired: limitCheck.upgradeRequired || false,
        message: limitCheck.upgradeRequired
          ? 'Please upgrade your subscription to access this feature.'
          : limitCheck.reason
      }, { status: 429 }); // Too Many Requests

      return { allowed: false, error: errorResponse };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Feature limit check error:', error);
    return {
      allowed: false,
      error: NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    };
  }
}

/**
 * 상품 생성 제한 확인 미들웨어
 */
export async function requireProductCreationLimit(request: NextRequest): Promise<NextResponse | null> {
  const companyId = request.headers.get('x-company-id');

  if (!companyId) {
    return NextResponse.json({ error: 'Company ID not found' }, { status: 400 });
  }

  const limitCheck = await checkFeatureLimit(companyId, 'create_product');

  if (!limitCheck.allowed) {
    return limitCheck.error!;
  }

  return null;
}

/**
 * 월간 주문 제한 확인 미들웨어
 */
export async function requireMonthlyOrderLimit(request: NextRequest): Promise<NextResponse | null> {
  const companyId = request.headers.get('x-company-id');

  if (!companyId) {
    return NextResponse.json({ error: 'Company ID not found' }, { status: 400 });
  }

  const limitCheck = await checkFeatureLimit(companyId, 'monthly_orders');

  if (!limitCheck.allowed) {
    return limitCheck.error!;
  }

  return null;
}

/**
 * 구독 플랜별 기능 접근 확인
 */
export async function requirePlan(planName: string, request: NextRequest): Promise<NextResponse | null> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const userPayload = await verifyJwt(token);

    if (userPayload.role !== 'COMPANY') {
      return NextResponse.json({ error: 'Company access required' }, { status: 403 });
    }

    const company = await prisma.company.findUnique({
      where: { ownerId: userPayload.sub }
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const subInfo = await getCompanySubscription(company.id);

    if (!subInfo.hasActiveSubscription) {
      return NextResponse.json({
        error: 'Active subscription required',
        code: 'SUBSCRIPTION_REQUIRED'
      }, { status: 402 });
    }

    if (subInfo.plan?.name !== planName) {
      return NextResponse.json({
        error: `${planName} plan required`,
        code: 'PLAN_UPGRADE_REQUIRED',
        currentPlan: subInfo.plan?.name,
        requiredPlan: planName,
        message: `This feature requires ${planName} plan. Please upgrade your subscription.`
      }, { status: 402 });
    }

    return null;
  } catch (error) {
    console.error('Plan requirement check error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Enterprise 플랜 전용 기능 확인
 */
export async function requireEnterprisePlan(request: NextRequest): Promise<NextResponse | null> {
  return requirePlan('Enterprise', request);
}

/**
 * 구독 관련 미들웨어를 조합하는 헬퍼 함수
 */
export function withSubscription(...middlewares: Array<(req: NextRequest) => Promise<NextResponse | null>>) {
  return async function combinedMiddleware(request: NextRequest): Promise<NextResponse | null> {
    // 먼저 활성 구독 확인
    const subCheck = await requireActiveSubscription(request);
    if (subCheck) return subCheck;

    // 추가 미들웨어들 순차 실행
    for (const middleware of middlewares) {
      const result = await middleware(request);
      if (result) return result;
    }

    return null;
  };
}

// 사용 예시를 위한 조합된 미들웨어들
export const withProductCreation = withSubscription(requireProductCreationLimit);
export const withOrderProcessing = withSubscription(requireMonthlyOrderLimit);
export const withAdvancedAnalytics = withSubscription(requireEnterprisePlan);