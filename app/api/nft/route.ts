import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '@/lib/auth';
import { transferNFT, burnNFT } from '@/lib/nft-mint';
import { sendXRP } from '@/lib/payment';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const me = await requireAuth();
    const body = await request.json();
    const { action, ...params } = body;

    switch (action) {
      case 'transfer': {
        const { nftId, toUserId, price } = params;

        // NFT 소유권 확인
        const nft = await prisma.postNFT.findUnique({
          where: { id: nftId },
          include: {
            owner: { include: { wallet: true } }
          }
        });

        if (!nft) {
          return NextResponse.json(
            { error: 'NFT not found' },
            { status: 404 }
          );
        }

        if (nft.ownerId !== me.id) {
          return NextResponse.json(
            { error: 'You do not own this NFT' },
            { status: 403 }
          );
        }

        // 수신자 확인
        const recipient = await prisma.account.findUnique({
          where: { id: toUserId },
          include: { wallet: true }
        });

        if (!recipient) {
          return NextResponse.json(
            { error: 'Recipient not found' },
            { status: 404 }
          );
        }

        // 가격이 있으면 결제 처리
        if (price && parseInt(price) > 0) {
          if (!recipient.wallet?.seedCipher || !nft.owner.wallet?.seedCipher) {
            return NextResponse.json(
              { error: 'Wallet configuration error' },
              { status: 500 }
            );
          }

          try {
            await sendXRP(
              recipient.wallet.seedCipher,
              nft.owner.wallet.seedCipher,
              price
            );
          } catch (error) {
            console.error('Payment failed:', error);
            return NextResponse.json(
              { error: 'Payment failed' },
              { status: 400 }
            );
          }
        }

        // NFT 전송 (실제 XRPL에서는 생략, DB만 업데이트)
        await prisma.$transaction(async (tx) => {
          // 소유권 변경
          await tx.postNFT.update({
            where: { id: nftId },
            data: { ownerId: toUserId }
          });

          // 전송 기록
          await tx.nFTTransfer.create({
            data: {
              nftId: nftId,
              fromId: me.id,
              toId: toUserId,
              price: price || null,
              txHash: `transfer_${Date.now()}_${Math.random().toString(36).substring(2)}`
            }
          });
        });

        return NextResponse.json({
          success: true,
          message: 'NFT transferred successfully'
        });
      }

      case 'create_license': {
        const { nftId, licenseeId, licenseType, price, duration } = params;

        // NFT 소유권 확인
        const nft = await prisma.postNFT.findUnique({
          where: { id: nftId }
        });

        if (!nft) {
          return NextResponse.json(
            { error: 'NFT not found' },
            { status: 404 }
          );
        }

        if (nft.ownerId !== me.id) {
          return NextResponse.json(
            { error: 'You do not own this NFT' },
            { status: 403 }
          );
        }

        // 라이선스 생성
        const expiresAt = duration
          ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000)
          : null;

        const license = await prisma.nFTLicense.create({
          data: {
            nftId: nftId,
            licenseeId: licenseeId,
            licenseType: licenseType,
            price: price || null,
            duration: duration || null,
            expiresAt: expiresAt
          },
          include: {
            licensee: {
              select: { id: true, displayName: true, email: true }
            }
          }
        });

        return NextResponse.json({
          success: true,
          license: license,
          message: 'License created successfully'
        });
      }

      case 'revoke_license': {
        const { licenseId } = params;

        // 라이선스 소유권 확인
        const license = await prisma.nFTLicense.findUnique({
          where: { id: licenseId },
          include: {
            nft: true
          }
        });

        if (!license) {
          return NextResponse.json(
            { error: 'License not found' },
            { status: 404 }
          );
        }

        if (license.nft.ownerId !== me.id) {
          return NextResponse.json(
            { error: 'You do not own this NFT' },
            { status: 403 }
          );
        }

        // 라이선스 비활성화
        await prisma.nFTLicense.update({
          where: { id: licenseId },
          data: { isActive: false }
        });

        return NextResponse.json({
          success: true,
          message: 'License revoked successfully'
        });
      }

      case 'burn': {
        const { nftId } = params;

        // NFT 소유권 확인
        const nft = await prisma.postNFT.findUnique({
          where: { id: nftId },
          include: {
            owner: { include: { wallet: true } }
          }
        });

        if (!nft) {
          return NextResponse.json(
            { error: 'NFT not found' },
            { status: 404 }
          );
        }

        if (nft.ownerId !== me.id) {
          return NextResponse.json(
            { error: 'You do not own this NFT' },
            { status: 403 }
          );
        }

        // XRPL에서 NFT 소각 (실제로는 생략)
        // const burnResult = await burnNFT(
        //   nft.owner.wallet!.seedCipher!,
        //   nft.nftTokenId
        // );

        // DB에서 NFT 삭제
        await prisma.postNFT.delete({
          where: { id: nftId }
        });

        return NextResponse.json({
          success: true,
          message: 'NFT burned successfully'
        });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('NFT management error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ownerId = searchParams.get('ownerId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);

    const skip = (page - 1) * limit;

    const whereClause = {
      ...(ownerId && { ownerId })
    };

    const [nfts, totalCount] = await Promise.all([
      prisma.postNFT.findMany({
        where: whereClause,
        include: {
          post: {
            include: {
              author: {
                select: { id: true, displayName: true, email: true }
              },
              images: {
                take: 1,
                orderBy: { position: 'asc' }
              }
            }
          },
          owner: {
            select: { id: true, displayName: true, email: true }
          },
          licenses: {
            where: { isActive: true },
            select: {
              id: true,
              licenseType: true,
              price: true,
              duration: true,
              licensee: {
                select: { displayName: true }
              }
            }
          }
        },
        orderBy: { mintedAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.postNFT.count({ where: whereClause })
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({
      nfts,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('NFT list retrieval error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}