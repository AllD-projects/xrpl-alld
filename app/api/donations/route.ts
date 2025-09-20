import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '@/lib/auth';
import { getUserDonations } from '@/lib/donation';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const me = await requireAuth();
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);
    const userId = searchParams.get('userId');

    // 다른 사용자의 기부 내역은 본인이나 관리자만 조회 가능
    const targetUserId = userId || me.id;
    if (targetUserId !== me.id && me.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Permission denied' },
        { status: 403 }
      );
    }

    const result = await getUserDonations(targetUserId, page, limit);

    return NextResponse.json({
      ...result,
      pagination: {
        page,
        limit,
        totalCount: result.totalCount,
        totalPages: result.totalPages,
        hasNext: page < result.totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get donations error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// 관리자용: 전체 기부 통계 조회
export async function POST(request: NextRequest) {
  try {
    const me = await requireAuth();

    if (me.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action, startDate, endDate } = body;

    if (action === 'stats') {
      // 전체 기부 통계
      const whereClause: any = {
        status: 'COMPLETED'
      };

      if (startDate) {
        whereClause.createdAt = {
          ...whereClause.createdAt,
          gte: new Date(startDate)
        };
      }

      if (endDate) {
        whereClause.createdAt = {
          ...whereClause.createdAt,
          lte: new Date(endDate)
        };
      }

      const [
        totalDonations,
        xrpDonations,
        mptDonations,
        uniqueDonors,
        topPosts
      ] = await Promise.all([
        // 총 기부 건수
        prisma.donation.count({ where: whereClause }),

        // XRP 기부 통계
        prisma.donation.aggregate({
          where: { ...whereClause, type: 'XRP' },
          _sum: { amount: true },
          _count: true
        }),

        // MPT 기부 통계
        prisma.donation.groupBy({
          by: ['currency'],
          where: { ...whereClause, type: 'MPT' },
          _sum: { amount: true },
          _count: { currency: true }
        }),

        // 고유 기부자 수
        prisma.donation.findMany({
          where: whereClause,
          select: { donorId: true },
          distinct: ['donorId']
        }),

        // 가장 많이 기부받은 게시글
        prisma.donation.groupBy({
          by: ['postId'],
          where: whereClause,
          _count: { postId: true },
          _sum: { amount: true },
          orderBy: { _count: { postId: 'desc' } },
          take: 10
        })
      ]);

      return NextResponse.json({
        totalDonations,
        totalAmount: {
          XRP: xrpDonations._sum.amount || '0',
          MPT: mptDonations.reduce((acc, curr) => {
            acc[curr.currency || 'UNKNOWN'] = curr._sum.amount || '0';
            return acc;
          }, {} as { [key: string]: string })
        },
        uniqueDonors: uniqueDonors.length,
        topPosts: topPosts.length,
        period: { startDate, endDate }
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Admin donation stats error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}