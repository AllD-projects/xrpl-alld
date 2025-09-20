import { PrismaClient } from '@prisma/client';
import { generateContentHash, generateNFTMetadata, mintNFT } from './nft-mint';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const prisma = new PrismaClient();

/**
 * 저작권 침해 검사
 */
export async function checkCopyrightInfringement(content: {
  title: string;
  description?: string;
  images: string[];
  authorId: string;
}): Promise<{
  isInfringing: boolean;
  existingNFT?: any;
  similarityScore?: number;
}> {
  try {
    // 컨텐츠 해시 생성
    const contentHash = generateContentHash({
      ...content,
      timestamp: new Date().toISOString()
    });

    // 정확히 일치하는 해시 검색
    const exactMatch = await prisma.postNFT.findUnique({
      where: { copyrightHash: contentHash },
      include: {
        post: {
          include: {
            author: {
              select: { id: true, displayName: true, email: true }
            }
          }
        },
        owner: {
          select: { id: true, displayName: true, email: true }
        }
      }
    });

    if (exactMatch) {
      return {
        isInfringing: true,
        existingNFT: exactMatch,
        similarityScore: 100
      };
    }

    // 유사도 검사 (제목 기반) - SQLite는 case insensitive 검색을 위해 다른 방법 사용
    const similarPosts = await prisma.postNFT.findMany({
      where: {
        post: {
          title: {
            contains: content.title.substring(0, 20)
          }
        }
      },
      include: {
        post: {
          include: {
            author: {
              select: { id: true, displayName: true, email: true }
            }
          }
        },
        owner: {
          select: { id: true, displayName: true, email: true }
        }
      },
      take: 5
    });

    // 간단한 유사도 계산
    let highestSimilarity = 0;
    let mostSimilarNFT = null;

    for (const nft of similarPosts) {
      const similarity = calculateTextSimilarity(
        content.title.toLowerCase(),
        nft.post.title.toLowerCase()
      );
      if (similarity > highestSimilarity) {
        highestSimilarity = similarity;
        mostSimilarNFT = nft;
      }
    }

    // 70% 이상 유사하면 침해 가능성
    if (highestSimilarity > 70) {
      return {
        isInfringing: true,
        existingNFT: mostSimilarNFT,
        similarityScore: highestSimilarity
      };
    }

    return {
      isInfringing: false,
      similarityScore: highestSimilarity
    };

  } catch (error) {
    console.error('Copyright check failed:', error);
    return {
      isInfringing: false,
      similarityScore: 0
    };
  }
}

/**
 * 텍스트 유사도 계산 (간단한 Jaccard 계수)
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return (intersection.size / union.size) * 100;
}

/**
 * 게시글에 대한 NFT 발행
 */
export async function mintPostNFT(
  postId: string,
  issuerSeed: string
): Promise<{
  success: boolean;
  nftId?: string;
  txHash?: string;
  error?: string;
}> {
  try {
    // 게시글 조회
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: {
          select: { id: true, displayName: true, email: true }
        },
        images: {
          orderBy: { position: 'asc' }
        },
        nft: true
      }
    });

    if (!post) {
      return { success: false, error: 'Post not found' };
    }

    if (post.nft) {
      return { success: false, error: 'NFT already exists for this post' };
    }

    // 저작권 침해 검사
    const copyrightCheck = await checkCopyrightInfringement({
      title: post.title,
      description: post.description || undefined,
      images: post.images.map(img => img.imageUrl),
      authorId: post.authorId
    });

    if (copyrightCheck.isInfringing) {
      return {
        success: false,
        error: `Copyright infringement detected. Similar content already exists (${copyrightCheck.similarityScore}% similarity)`
      };
    }

    // 컨텐츠 해시 생성
    const copyrightHash = generateContentHash({
      title: post.title,
      description: post.description || undefined,
      images: post.images.map(img => img.imageUrl),
      authorId: post.authorId,
      timestamp: post.createdAt.toISOString()
    });

    // NFT 메타데이터 생성
    const metadata = generateNFTMetadata(
      {
        id: post.id,
        title: post.title,
        description: post.description || undefined,
        images: post.images,
        author: post.author,
        createdAt: post.createdAt.toISOString()
      },
      copyrightHash
    );

    // 메타데이터 파일 저장
    const metadataDir = join(process.cwd(), 'public', 'metadata', 'nft');
    await mkdir(metadataDir, { recursive: true });

    const metadataFilename = `${postId}_${Date.now()}.json`;
    const metadataPath = join(metadataDir, metadataFilename);
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    const metadataUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/metadata/nft/${metadataFilename}`;

    // XRPL에서 NFT 발행
    console.log('🚀 Starting NFT mint for post:', {
      postId,
      metadataUrl,
      copyrightHash
    });

    const mintResult = await mintNFT(issuerSeed, metadataUrl);
    console.log('🎯 NFT Mint Result:', mintResult);

    if (!mintResult.success || !mintResult.nftTokenId) {
      console.error('❌ NFT minting failed:', mintResult.error);
      return {
        success: false,
        error: mintResult.error || 'NFT minting failed'
      };
    }

    // 데이터베이스에 NFT 정보 저장
    const nft = await prisma.postNFT.create({
      data: {
        postId: postId,
        ownerId: post.authorId,
        nftTokenId: mintResult.nftTokenId,
        txHash: mintResult.txHash!,
        metadataUrl: metadataUrl,
        copyrightHash: copyrightHash
      }
    });

    console.log(`✅ Post NFT created successfully: ${nft.id}`);

    return {
      success: true,
      nftId: nft.id,
      txHash: mintResult.txHash
    };

  } catch (error: any) {
    console.error('❌ Post NFT creation failed:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    };
  }
}

/**
 * 저작권 증명서 생성
 */
export async function generateCopyrightCertificate(nftId: string): Promise<{
  success: boolean;
  certificateUrl?: string;
  error?: string;
}> {
  try {
    const nft = await prisma.postNFT.findUnique({
      where: { id: nftId },
      include: {
        post: {
          include: {
            author: {
              select: { displayName: true, email: true }
            },
            images: true
          }
        },
        owner: {
          select: { displayName: true, email: true }
        }
      }
    });

    if (!nft) {
      return { success: false, error: 'NFT not found' };
    }

    const certificate = {
      title: 'Digital Copyright Certificate',
      nftTokenId: nft.nftTokenId,
      postTitle: nft.post.title,
      originalAuthor: nft.post.author.displayName,
      currentOwner: nft.owner.displayName,
      copyrightHash: nft.copyrightHash,
      mintedAt: nft.mintedAt.toISOString(),
      blockchainTxHash: nft.txHash,
      verification: {
        network: 'XRPL',
        verified: true,
        verificationUrl: `https://testnet.xrpl.org/transactions/${nft.txHash}`
      },
      content: {
        title: nft.post.title,
        description: nft.post.description,
        imageCount: nft.post.images.length,
        createdAt: nft.post.createdAt
      },
      disclaimer: 'This certificate serves as proof of digital ownership and copyright registration on the XRP Ledger blockchain.'
    };

    // 증명서 파일 저장
    const certDir = join(process.cwd(), 'public', 'certificates');
    await mkdir(certDir, { recursive: true });

    const certFilename = `copyright_${nftId}_${Date.now()}.json`;
    const certPath = join(certDir, certFilename);
    await writeFile(certPath, JSON.stringify(certificate, null, 2));

    const certificateUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/certificates/${certFilename}`;

    return {
      success: true,
      certificateUrl: certificateUrl
    };

  } catch (error: any) {
    console.error('❌ Certificate generation failed:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    };
  }
}