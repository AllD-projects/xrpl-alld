import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '@/lib/auth';
import { donateWithXRP, donateWithMPT, getDonationStats } from '@/lib/donation';

const prisma = new PrismaClient();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const me = await requireAuth();
    const { postId } = await params;
    const body = await request.json();
    const { type, amount, message, currency } = body;

    console.log('🎁 Donation request:', {
      postId,
      donorId: me.id,
      type,
      amount,
      currency
    });

    // 게시글 존재 확인
    const post = await prisma.post.findUnique({
      where: { id: postId, isActive: true },
      include: {
        author: {
          include: {
            wallet: true
          }
        }
      }
    });

    if (!post) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    // 본인 게시글에는 기부 불가
    if (post.authorId === me.id) {
      return NextResponse.json(
        { error: 'Cannot donate to your own post' },
        { status: 400 }
      );
    }

    // 게시글 작성자의 지갑 주소 확인
    if (!post.author.wallet?.classicAddress) {
      return NextResponse.json(
        { error: 'Post author does not have a wallet configured' },
        { status: 400 }
      );
    }

    // 기부자 지갑 정보 확인 (USER vs COMPANY 구분)
    let donorWallet;

    if (me.role === 'COMPANY') {
      // Company인 경우 Company 테이블에서 지갑 조회
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

      donorWallet = company.wallet;
      console.log('Company donor wallet:', donorWallet);

    } else {
      // USER인 경우 Account 테이블에서 지갑 조회
      const account = await prisma.account.findUnique({
        where: { id: me.id },
        include: { wallet: true }
      });

      donorWallet = account?.wallet;
      console.log('User donor wallet:', donorWallet);
    }

    if (!donorWallet?.seedCipher) {
      return NextResponse.json(
        { error: 'Donor wallet not configured' },
        { status: 400 }
      );
    }

    let donationResult;

    if (type === 'XRP') {
      // XRP 기부
      if (!amount || isNaN(parseInt(amount))) {
        return NextResponse.json(
          { error: 'Invalid XRP amount' },
          { status: 400 }
        );
      }

      // 수신자의 seed가 필요하지만 보안상 저장되지 않을 수 있으므로
      // 실제로는 address만 사용하는 방식으로 sendXRP 함수를 수정해야 함
      if (!post.author.wallet.seedCipher) {
        return NextResponse.json(
          { error: 'Recipient wallet seed not configured' },
          { status: 400 }
        );
      }

      donationResult = await donateWithXRP(
        donorWallet.seedCipher,
        post.author.wallet.seedCipher,
        amount,
        postId,
        me.id,
        message
      );

    } else if (type === 'MPT') {
      // MPT 기부
      if (!amount || !currency) {
        return NextResponse.json(
          { error: 'Amount and currency are required for MPT donation' },
          { status: 400 }
        );
      }

      // GlobalConfig에서 MPT 발행자 정보 조회
      const globalConfig = await prisma.globalConfig.findFirst({
        include: {
          adminIssuerWallet: true
        }
      });

      if (!globalConfig?.mptIssuanceId || !post.author.wallet.seedCipher) {
        return NextResponse.json(
          { error: 'MPT configuration not complete' },
          { status: 500 }
        );
      }

      donationResult = await donateWithMPT(
        post.author.wallet.seedCipher,
        donorWallet.seedCipher,
        globalConfig.mptIssuanceId,
        amount,
        postId,
        me.id,
        message
      );

    } else {
      return NextResponse.json(
        { error: 'Invalid donation type. Must be XRP or MPT' },
        { status: 400 }
      );
    }

    if (!donationResult.success) {
      return NextResponse.json(
        { error: donationResult.error || 'Donation failed' },
        { status: 400 }
      );
    }

    // 완성된 기부 정보 조회
    const donation = await prisma.donation.findUnique({
      where: { id: donationResult.donationId! },
      include: {
        donor: {
          select: {
            id: true,
            displayName: true,
            role: true
          }
        },
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
      }
    });

    return NextResponse.json({
      success: true,
      donation,
      txHash: donationResult.txHash,
      message: 'Donation completed successfully'
    });

  } catch (error) {
    console.error('Donation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId } = await params;

    // 게시글 존재 확인
    const post = await prisma.post.findUnique({
      where: { id: postId, isActive: true }
    });

    if (!post) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    // 기부 통계 조회
    const stats = await getDonationStats(postId);

    return NextResponse.json({
      postId,
      stats
    });

  } catch (error) {
    console.error('Get donation stats error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}