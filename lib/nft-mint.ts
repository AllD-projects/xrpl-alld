import { Client, Wallet, Transaction } from 'xrpl';
import crypto from 'crypto';

/**
 * 컨텐츠 해시 생성 (저작권 증명용)
 */
export function generateContentHash(content: {
  title: string;
  description?: string;
  images: string[];
  authorId: string;
  timestamp: string;
}): string {
  const contentString = JSON.stringify({
    title: content.title,
    description: content.description || '',
    images: content.images.sort(), // 이미지 순서 정규화
    authorId: content.authorId,
    timestamp: content.timestamp
  });

  return crypto.createHash('sha256').update(contentString).digest('hex');
}

/**
 * NFT 메타데이터 생성
 */
export function generateNFTMetadata(post: {
  id: string;
  title: string;
  description?: string;
  images: { imageUrl: string; alt?: string }[];
  author: { displayName: string; email: string };
  createdAt: string;
}, copyrightHash: string) {
  return {
    name: `Copyright: ${post.title}`,
    description: `Copyright protection NFT for post "${post.title}" by ${post.author.displayName}`,
    image: post.images[0]?.imageUrl || '',
    external_url: `${process.env.NEXT_PUBLIC_BASE_URL}/posts/${post.id}`,
    attributes: [
      {
        trait_type: 'Content Type',
        value: 'Post'
      },
      {
        trait_type: 'Author',
        value: post.author.displayName
      },
      {
        trait_type: 'Created Date',
        value: post.createdAt
      },
      {
        trait_type: 'Image Count',
        value: post.images.length
      },
      {
        trait_type: 'Copyright Hash',
        value: copyrightHash
      }
    ],
    properties: {
      postId: post.id,
      originalContent: {
        title: post.title,
        description: post.description,
        images: post.images
      },
      copyrightHash: copyrightHash,
      mintedAt: new Date().toISOString()
    }
  };
}

/**
 * XRPL에서 NFT 발행
 */
export async function mintNFT(
  issuerSeed: string,
  uri: string,
  taxon: number = 0
): Promise<{
  success: boolean;
  nftTokenId?: string;
  txHash?: string;
  error?: string;
}> {
  const client = new Client(process.env.XRPL_RPC_URL || 'wss://s.altnet.rippletest.net:51233');

  try {
    await client.connect();
    const issuerWallet = Wallet.fromSeed(issuerSeed);

    const nftMintTx: Transaction = {
      TransactionType: 'NFTokenMint',
      Account: issuerWallet.address,
      URI: Buffer.from(uri, 'utf8').toString('hex').toUpperCase(),
      Flags: {
        tfBurnable: true,        // 소각 가능
        tfOnlyXRP: true,         // XRP로만 거래
        tfTransferable: true     // 전송 가능
      },
      NFTokenTaxon: taxon
    };

    const prepared = await client.autofill(nftMintTx);
    console.log('🔄 NFT Mint Transaction prepared:', JSON.stringify(prepared, null, 2));

    const signed = issuerWallet.sign(prepared);
    console.log('✍️ NFT Mint Transaction signed:', {
      hash: signed.hash,
      tx_blob: signed.tx_blob.substring(0, 100) + '...'
    });

    const result = await client.submitAndWait(signed.tx_blob);
    console.log('📥 XRPL NFT Mint Result:', JSON.stringify(result, null, 2));

    // 트랜잭션 성공 확인
    if (result.result.meta?.TransactionResult !== 'tesSUCCESS') {
      throw new Error(`NFT minting failed: ${result.result.meta?.TransactionResult}`);
    }

    // NFT Token ID 추출
    const affectedNodes = result.result.meta?.AffectedNodes || [];
    let nftTokenId: string | undefined;

    for (const node of affectedNodes) {
      if (node.CreatedNode?.LedgerEntryType === 'NFTokenPage') {
        const nftTokens = node.CreatedNode.NewFields?.NFTokens || [];
        if (nftTokens.length > 0) {
          nftTokenId = nftTokens[0].NFToken?.NFTokenID;
          break;
        }
      } else if (node.ModifiedNode?.LedgerEntryType === 'NFTokenPage') {
        const finalFields = node.ModifiedNode.FinalFields;
        const previousFields = node.ModifiedNode.PreviousFields;

        if (finalFields?.NFTokens && previousFields?.NFTokens) {
          const newTokens = finalFields.NFTokens.filter(
            (token: any) => !previousFields.NFTokens.find(
              (prevToken: any) => prevToken.NFToken?.NFTokenID === token.NFToken?.NFTokenID
            )
          );

          if (newTokens.length > 0) {
            nftTokenId = newTokens[0].NFToken?.NFTokenID;
            break;
          }
        }
      }
    }

    if (!nftTokenId) {
      throw new Error('Failed to extract NFT Token ID from transaction result');
    }

    console.log(`✅ NFT minted successfully: ${nftTokenId}`);
    console.log(`   Transaction: ${result.result.hash}`);
    console.log(`   Issuer: ${issuerWallet.address}`);

    return {
      success: true,
      nftTokenId: nftTokenId,
      txHash: result.result.hash
    };

  } catch (error: any) {
    console.error('❌ NFT minting failed:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    };
  } finally {
    await client.disconnect();
  }
}

/**
 * NFT 전송
 */
export async function transferNFT(
  fromSeed: string,
  toAddress: string,
  nftTokenId: string
): Promise<{
  success: boolean;
  txHash?: string;
  error?: string;
}> {
  const client = new Client(process.env.XRPL_RPC_URL || 'wss://s.altnet.rippletest.net:51233');

  try {
    await client.connect();
    const fromWallet = Wallet.fromSeed(fromSeed);

    const transferTx: Transaction = {
      TransactionType: 'NFTokenCreateOffer',
      Account: fromWallet.address,
      NFTokenID: nftTokenId,
      Destination: toAddress,
      Amount: '0', // 무료 전송
      Flags: {
        tfSellNFToken: true
      }
    };

    const prepared = await client.autofill(transferTx);
    const signed = fromWallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);

    if (result.result.meta?.TransactionResult !== 'tesSUCCESS') {
      throw new Error(`NFT transfer failed: ${result.result.meta?.TransactionResult}`);
    }

    return {
      success: true,
      txHash: result.result.hash
    };

  } catch (error: any) {
    console.error('❌ NFT transfer failed:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    };
  } finally {
    await client.disconnect();
  }
}

/**
 * NFT 소각
 */
export async function burnNFT(
  ownerSeed: string,
  nftTokenId: string
): Promise<{
  success: boolean;
  txHash?: string;
  error?: string;
}> {
  const client = new Client(process.env.XRPL_RPC_URL || 'wss://s.altnet.rippletest.net:51233');

  try {
    await client.connect();
    const ownerWallet = Wallet.fromSeed(ownerSeed);

    const burnTx: Transaction = {
      TransactionType: 'NFTokenBurn',
      Account: ownerWallet.address,
      NFTokenID: nftTokenId
    };

    const prepared = await client.autofill(burnTx);
    const signed = ownerWallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);

    if (result.result.meta?.TransactionResult !== 'tesSUCCESS') {
      throw new Error(`NFT burn failed: ${result.result.meta?.TransactionResult}`);
    }

    console.log(`✅ NFT burned successfully: ${nftTokenId}`);
    console.log(`   Transaction: ${result.result.hash}`);

    return {
      success: true,
      txHash: result.result.hash
    };

  } catch (error: any) {
    console.error('❌ NFT burn failed:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    };
  } finally {
    await client.disconnect();
  }
}