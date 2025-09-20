import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '@/lib/auth';
import { mintPostNFT, checkCopyrightInfringement, generateCopyrightCertificate } from '@/lib/copyright-protection';

const prisma = new PrismaClient();

// 게시글에 대한 NFT 발행
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const me = await requireAuth();
    const { postId } = await params;

    // 게시글 존재 및 권한 확인
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: {
          select: { id: true, displayName: true, email: true }
        },
        nft: true
      }
    });

    if (!post) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    if (post.authorId !== me.id) {
      return NextResponse.json(
        { error: 'Only the author can mint NFT for this post' },
        { status: 403 }
      );
    }

    if (post.nft) {
      return NextResponse.json(
        { error: 'NFT already exists for this post' },
        { status: 400 }
      );
    }

    // GlobalConfig에서 Admin 지갑 정보 조회
    const globalConfig = await prisma.globalConfig.findFirst({
      include: { adminIssuerWallet: true }
    });

    if (!globalConfig?.adminIssuerWallet?.seedCipher) {
      return NextResponse.json(
        { error: 'NFT issuer configuration not found' },
        { status: 500 }
      );
    }

    // NFT 발행
    console.log('🎨 API: Starting NFT mint request for post:', {
      postId,
      authorId: me.id,
      authorName: me.displayName,
      postTitle: post.title
    });

    const mintResult = await mintPostNFT(
      postId,
      globalConfig.adminIssuerWallet.seedCipher
    );

    if (!mintResult.success) {
      console.error('❌ API: NFT minting failed for post:', postId, mintResult.error);
      return NextResponse.json(
        { error: mintResult.error || 'NFT minting failed' },
        { status: 400 }
      );
    }

    console.log('✅ API: NFT minting completed successfully for post:', {
      postId,
      nftId: mintResult.nftId,
      txHash: mintResult.txHash
    });

    // 발행된 NFT 정보 조회
    const nft = await prisma.postNFT.findUnique({
      where: { id: mintResult.nftId! },
      include: {
        post: {
          include: {
            author: {
              select: { id: true, displayName: true, email: true }
            },
            images: true
          }
        },
        owner: {
          select: { id: true, displayName: true, email: true }
        }
      }
    });

    return NextResponse.json({
      success: true,
      nft: nft,
      txHash: mintResult.txHash,
      message: 'NFT minted successfully for copyright protection'
    });

  } catch (error) {
    console.error('NFT minting error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// NFT 정보 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId } = await params;
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'check_copyright': {
        // 저작권 침해 검사
        const post = await prisma.post.findUnique({
          where: { id: postId },
          include: {
            images: true
          }
        });

        if (!post) {
          return NextResponse.json(
            { error: 'Post not found' },
            { status: 404 }
          );
        }

        const copyrightCheck = await checkCopyrightInfringement({
          title: post.title,
          description: post.description || undefined,
          images: post.images.map(img => img.imageUrl),
          authorId: post.authorId
        });

        return NextResponse.json({
          isInfringing: copyrightCheck.isInfringing,
          similarityScore: copyrightCheck.similarityScore,
          existingNFT: copyrightCheck.existingNFT || null
        });
      }

      case 'certificate': {
        // 저작권 증명서 생성
        const nft = await prisma.postNFT.findUnique({
          where: { postId: postId }
        });

        if (!nft) {
          return NextResponse.json(
            { error: 'NFT not found for this post' },
            { status: 404 }
          );
        }

        const certificateResult = await generateCopyrightCertificate(nft.id);

        if (!certificateResult.success) {
          return NextResponse.json(
            { error: certificateResult.error },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          certificateUrl: certificateResult.certificateUrl
        });
      }

      default: {
        // NFT 정보 조회
        const nft = await prisma.postNFT.findUnique({
          where: { postId: postId },
          include: {
            post: {
              include: {
                author: {
                  select: { id: true, displayName: true, email: true }
                },
                images: true
              }
            },
            owner: {
              select: { id: true, displayName: true, email: true }
            },
            licenses: {
              where: { isActive: true },
              include: {
                licensee: {
                  select: { id: true, displayName: true, email: true }
                }
              }
            },
            transferHistory: {
              include: {
                from: {
                  select: { id: true, displayName: true, email: true }
                },
                to: {
                  select: { id: true, displayName: true, email: true }
                }
              },
              orderBy: { createdAt: 'desc' }
            }
          }
        });

        if (!nft) {
          return NextResponse.json(
            { error: 'NFT not found for this post' },
            { status: 404 }
          );
        }

        return NextResponse.json(nft);
      }
    }

  } catch (error) {
    console.error('NFT info retrieval error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}