import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '@/lib/auth';

const prisma = new PrismaClient();

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

    // 사용자 목록 조회
    const users = await prisma.account.findMany({
      include: {
        wallet: {
          select: {
            classicAddress: true,
            seedCipher: true,
            kind: true
          }
        },
        _count: {
          select: {
            pointLedgers: true,
            orders: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // 각 사용자의 포인트 잔액 계산
    const usersWithBalance = await Promise.all(
      users.map(async (user) => {
        const pointLedgers = await prisma.pointLedger.findMany({
          where: { accountId: user.id }
        });

        let balance = 0;
        pointLedgers.forEach((ledger) => {
          if (ledger.type === 'EARN' || ledger.type === 'ADMIN_CREDIT' || ledger.type === 'REFUND') {
            balance += parseInt(ledger.amount);
          } else if (ledger.type === 'USE') {
            balance -= parseInt(ledger.amount);
          }
        });

        return {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          isActive: user.isActive,
          wallet: user.wallet ? {
            address: user.wallet.classicAddress,
            kind: user.wallet.kind,
            hasSeed: !!user.wallet.seedCipher
          } : null,
          pointBalance: balance,
          stats: {
            totalPointTransactions: user._count.pointLedgers,
            totalOrders: user._count.orders
          },
          createdAt: user.createdAt
        };
      })
    );

    return NextResponse.json({
      success: true,
      users: usersWithBalance,
      totalUsers: users.length
    });

  } catch (error) {
    console.error('Get users error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}