import { PrismaClient } from '@prisma/client';
import { sendXRP } from './payment';
import { sendMPT } from './sendMpt';

const prisma = new PrismaClient();

/**
 * XRP로 기부하기
 */
export async function donateWithXRP(
  donorSeed: string,
  recipientSeed: string,
  amountDrops: string,
  postId: string,
  donorId: string,
  message?: string
): Promise<{
  success: boolean;
  txHash?: string;
  donationId?: string;
  error?: string;
}> {
  try {
    console.log('🎁 Starting XRP donation:', {
      postId,
      donorId,
      amountDrops
    });

    // 기부 기록 생성 (PENDING 상태)
    const donation = await prisma.donation.create({
      data: {
        postId,
        donorId,
        type: 'XRP',
        amount: amountDrops,
        message: message || null,
        status: 'PENDING'
      }
    });

    console.log('📝 Donation record created:', donation.id);

    // XRP 전송 (sendXRP는 user1Seed, user2Seed, amount 파라미터)
    const paymentResult = await sendXRP(donorSeed, recipientSeed, amountDrops);

    // 트랜잭션 성공 확인
    const txResult = paymentResult.result ?? paymentResult;
    const transactionResult = txResult.meta?.TransactionResult;

    if (transactionResult !== 'tesSUCCESS') {
      // 결제 실패 시 기부 상태 업데이트
      await prisma.donation.update({
        where: { id: donation.id },
        data: { status: 'FAILED' }
      });

      return {
        success: false,
        error: `Payment failed: ${transactionResult || 'Unknown error'}`
      };
    }

    // 성공 시 기부 상태 및 트랜잭션 해시 업데이트
    const txHash = txResult.hash || txResult.tx_json?.hash;
    const updatedDonation = await prisma.donation.update({
      where: { id: donation.id },
      data: {
        status: 'COMPLETED',
        txHash: txHash
      }
    });

    console.log('✅ XRP donation completed:', {
      donationId: updatedDonation.id,
      txHash: txHash
    });

    return {
      success: true,
      txHash: txHash,
      donationId: updatedDonation.id
    };

  } catch (error: unknown) {
    console.error('❌ XRP donation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * MPT로 기부하기
 */
export async function donateWithMPT(
  recipientSeed: string,
  donorSeed: string,
  issuanceId: string,
  amount: string,
  postId: string,
  donorId: string,
  message?: string
): Promise<{
  success: boolean;
  txHash?: string;
  donationId?: string;
  error?: string;
}> {
  try {
    console.log('🎁 Starting MPT donation:', {
      postId,
      donorId,
      amount,
      issuanceId
    });

    // 기부 기록 생성 (PENDING 상태)
    const donation = await prisma.donation.create({
      data: {
        postId,
        donorId,
        type: 'MPT',
        amount,
        currency: 'FASHIONPOINT', // MPT 코드
        message: message || null,
        status: 'PENDING'
      }
    });

    console.log('📝 MPT donation record created:', donation.id);

    // MPT 전송 (sendMPT는 userSeed, adminSeed, issuanceId, value 파라미터)
    const mptResult = await sendMPT(recipientSeed, donorSeed, issuanceId, amount);

    // 트랜잭션 성공 확인
    const txResult = mptResult.result ?? mptResult;
    const transactionResult = txResult.meta?.TransactionResult;

    if (transactionResult !== 'tesSUCCESS') {
      // 결제 실패 시 기부 상태 업데이트
      await prisma.donation.update({
        where: { id: donation.id },
        data: { status: 'FAILED' }
      });

      return {
        success: false,
        error: `MPT payment failed: ${transactionResult || 'Unknown error'}`
      };
    }

    // 성공 시 기부 상태 및 트랜잭션 해시 업데이트
    const txHash = txResult.hash || txResult.tx_json?.hash;
    const updatedDonation = await prisma.donation.update({
      where: { id: donation.id },
      data: {
        status: 'COMPLETED',
        txHash: txHash
      }
    });

    console.log('✅ MPT donation completed:', {
      donationId: updatedDonation.id,
      txHash: txHash
    });

    return {
      success: true,
      txHash: txHash,
      donationId: updatedDonation.id
    };

  } catch (error: unknown) {
    console.error('❌ MPT donation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * 기부 통계 조회
 */
export async function getDonationStats(postId: string): Promise<{
  totalXRP: string;
  totalMPT: { [currency: string]: string };
  donorCount: number;
  recentDonations: unknown[];
}> {
  try {
    const donations = await prisma.donation.findMany({
      where: {
        postId,
        status: 'COMPLETED'
      },
      include: {
        donor: {
          select: {
            id: true,
            displayName: true,
            role: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    let totalXRP = '0';
    const totalMPT: { [currency: string]: string } = {};
    const donorSet = new Set();

    for (const donation of donations) {
      donorSet.add(donation.donorId);

      if (donation.type === 'XRP') {
        totalXRP = (BigInt(totalXRP) + BigInt(donation.amount)).toString();
      } else if (donation.type === 'MPT' && donation.currency) {
        if (!totalMPT[donation.currency]) {
          totalMPT[donation.currency] = '0';
        }
        totalMPT[donation.currency] = (
          BigInt(totalMPT[donation.currency]) + BigInt(donation.amount)
        ).toString();
      }
    }

    return {
      totalXRP,
      totalMPT,
      donorCount: donorSet.size,
      recentDonations: donations.slice(0, 10) // 최근 10개
    };

  } catch (error) {
    console.error('❌ Failed to get donation stats:', error);
    return {
      totalXRP: '0',
      totalMPT: {},
      donorCount: 0,
      recentDonations: []
    };
  }
}

/**
 * 사용자의 기부 내역 조회
 */
export async function getUserDonations(
  userId: string,
  page: number = 1,
  limit: number = 10
): Promise<{
  donations: unknown[];
  totalCount: number;
  totalPages: number;
}> {
  try {
    const skip = (page - 1) * limit;

    const [donations, totalCount] = await Promise.all([
      prisma.donation.findMany({
        where: {
          donorId: userId,
          status: 'COMPLETED'
        },
        include: {
          post: {
            select: {
              id: true,
              title: true,
              author: {
                select: {
                  displayName: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take: limit
      }),
      prisma.donation.count({
        where: {
          donorId: userId,
          status: 'COMPLETED'
        }
      })
    ]);

    return {
      donations,
      totalCount,
      totalPages: Math.ceil(totalCount / limit)
    };

  } catch (error) {
    console.error('❌ Failed to get user donations:', error);
    return {
      donations: [],
      totalCount: 0,
      totalPages: 0
    };
  }
}