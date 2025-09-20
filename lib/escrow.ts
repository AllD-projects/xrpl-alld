import { Client, Wallet, Transaction } from "xrpl"
import { encodeForSigning, encode } from "ripple-binary-codec"
import { sign as kpSign, deriveKeypair } from "ripple-keypairs"

/**
 * MPT 토큰 에스크로 생성 (포인트 Lock)
 */
export async function createMPTEscrow(
  client: Client,
  senderWallet: Wallet,
  destinationAddress: string,
  mptIssuanceId: string,
  amount: string,
  finishAfterSeconds: number = 60  // 기본 7일
) {
  // XRPL 시간은 2000년 1월 1일 기준 (946684800 = Unix epoch와의 차이)
  const finishAfter = Math.floor(Date.now() / 1000) + finishAfterSeconds - 946684800 + 60;
  const cancelAfter = finishAfter + (60); // 추가 7일 후 취소 가능

  const escrowTx: Transaction = {
    TransactionType: 'EscrowCreate',
    Account: senderWallet.address,
    Destination: destinationAddress,
    Amount: {
      mpt_issuance_id: mptIssuanceId,
      value: Math.round(amount).toString()
    },
    FinishAfter: finishAfter,
    CancelAfter: cancelAfter,
  };

  try {
    const prepared = await client.autofill(escrowTx);

    const toSign = {
      ...prepared,
      SigningPubKey: senderWallet.publicKey,
    }
    const { privateKey, publicKey } = deriveKeypair(senderWallet.seed!)
    const signingData = encodeForSigning(toSign as any)
    const signature   = kpSign(signingData, privateKey)

    const signedTx = { ...toSign, TxnSignature: signature }
    const tx_blob  = encode(signedTx)


    const result = await client.submitAndWait(tx_blob)

    console.log(`✅ MPT Escrow 생성 완료: ${result.result.hash}`);

    return {
      success: true,
      txHash: result.result.hash,
      sequence: (prepared as any).Sequence,
      finishAfter: new Date((finishAfter + 946684800) * 1000),
      cancelAfter: new Date((cancelAfter + 946684800) * 1000),
      result: result
    };
  } catch (error) {
    console.error('❌ MPT Escrow 생성 실패:', error);
    throw error;
  }
}

/**
 * MPT 토큰 에스크로 완료 (포인트 Unlock)
 */
export async function finishMPTEscrow(
  client: Client,
  fulfillerWallet: Wallet,
  ownerAddress: string,
  escrowSequence: number,
  mptIssuanceId: string
) {
  const escrowFinishTx: Transaction = {
    TransactionType: 'EscrowFinish',
    Account: fulfillerWallet.address,
    Owner: ownerAddress,
    OfferSequence: escrowSequence,
    MPTokenIssuanceID: mptIssuanceId
  };

  try {
    const prepared = await client.autofill(escrowFinishTx);
    const signed = fulfillerWallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);

    console.log(`✅ MPT Escrow 완료: ${result.result.hash}`);

    return {
      success: true,
      txHash: result.result.hash,
      result: result
    };
  } catch (error) {
    console.error('❌ MPT Escrow 완료 실패:', error);
    throw error;
  }
}

/**
 * MPT 토큰 에스크로 취소 (환불 등)
 */
export async function cancelMPTEscrow(
  client: Client,
  cancellerWallet: Wallet,
  ownerAddress: string,
  escrowSequence: number,
  mptIssuanceId: string
) {
  const escrowCancelTx: Transaction = {
    TransactionType: 'EscrowCancel',
    Account: cancellerWallet.address,
    Owner: ownerAddress,
    OfferSequence: escrowSequence,
    MPTokenIssuanceID: mptIssuanceId
  };

  try {
    const prepared = await client.autofill(escrowCancelTx);
    const signed = cancellerWallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);

    console.log(`✅ MPT Escrow 취소: ${result.result.hash}`);

    return {
      success: true,
      txHash: result.result.hash,
      result: result
    };
  } catch (error) {
    console.error('❌ MPT Escrow 취소 실패:', error);
    throw error;
  }
}

/**
 * 에스크로 상태 확인
 */
export async function checkEscrowStatus(
  client: Client,
  ownerAddress: string,
  escrowSequence: number
) {
  try {
    console.log(`🔍 Checking escrow status: owner=${ownerAddress}, sequence=${escrowSequence}`);

    const response = await client.request({
      command: 'account_objects',
      account: ownerAddress,
      type: 'escrow'
    });

    console.log(`📋 Found ${response.result.account_objects.length} escrow objects for ${ownerAddress}`);

    // 여러 방법으로 에스크로 찾기 시도
    let escrow = response.result.account_objects.find(
      (obj: any) => obj.PreviousTxnID === escrowSequence
    );

    // PreviousTxnID로 찾지 못한 경우 Sequence로 찾기
    if (!escrow) {
      escrow = response.result.account_objects.find(
        (obj: any) => obj.Sequence === escrowSequence
      );
    }

    // 여전히 찾지 못한 경우 모든 에스크로 로그
    if (!escrow) {
      console.log('🔍 All escrow objects:', JSON.stringify(response.result.account_objects, null, 2));

      // 에스크로가 이미 완료되었거나 취소되었을 수 있음
      return {
        exists: false,
        alreadyProcessed: true,
        message: 'Escrow not found - likely already finished/cancelled'
      };
    }

    const now = Math.floor(Date.now() / 1000) - 946684800;
    const finishAfter = escrow.FinishAfter;
    const cancelAfter = escrow.CancelAfter;

    console.log(`⏰ Escrow timing: now=${now}, finishAfter=${finishAfter}, cancelAfter=${cancelAfter}`);

    return {
      exists: true,
      canFinish: now >= finishAfter,
      canCancel: now >= cancelAfter,
      finishAfter: new Date((finishAfter + 946684800) * 1000),
      cancelAfter: new Date((cancelAfter + 946684800) * 1000),
      destination: escrow.Destination,
      amount: escrow.Amount,
      escrowData: escrow
    };
  } catch (error) {
    console.error('❌ Escrow 상태 확인 실패:', error);
    return {
      exists: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to check escrow status'
    };
  }
}

/**
 * 구매 시 포인트 사용을 위한 에스크로 생성
 * (사용자 → 회사로 포인트 에스크로)
 */
export async function createPointUsageEscrow(
  userSeed: string,
  companyAddress: string,
  mptIssuanceId: string,
  pointAmount: string,
  refundPeriodDays: number = 7
) {
  const client = new Client(process.env.XRPL_RPC_URL || 'wss://s.altnet.rippletest.net:51233');

  try {
    await client.connect();
    const userWallet = Wallet.fromSeed(userSeed);

    const result = await createMPTEscrow(
      client,
      userWallet,
      companyAddress,
      mptIssuanceId,
      pointAmount,
      refundPeriodDays * 24 * 60 * 60
    );

    return result;
  } finally {
    await client.disconnect();
  }
}

/**
 * 포인트 적립을 위한 에스크로 생성
 * (관리자 → 사용자로 포인트 에스크로)
 */
export async function createPointRewardEscrow(
  adminSeed: string,
  userAddress: string,
  mptIssuanceId: string,
  pointAmount: string,
  lockPeriodDays: number = 7
) {
  const client = new Client(process.env.XRPL_RPC_URL || 'wss://s.altnet.rippletest.net:51233');

  try {
    await client.connect();
    const adminWallet = Wallet.fromSeed(adminSeed);

    const result = await createMPTEscrow(
      client,
      adminWallet,
      userAddress,
      mptIssuanceId,
      pointAmount,
      lockPeriodDays * 24 * 60 * 60
    );

    return result;
  } finally {
    await client.disconnect();
  }
}

/**
 * 에스크로된 포인트 해제 (환불 기간 종료 후)
 *
 * @param releaserSeed - 실행자의 시드 (생성자, 수신자, 또는 제3자 가능)
 * @param ownerAddress - 에스크로 생성자 주소
 * @param escrowSequence - 에스크로 시퀀스 번호
 * @param mptIssuanceId - MPT 발행 ID
 *
 * 실행 가능 조건:
 * - FinishAfter 시간 경과 후
 * - 누구나 실행 가능 (가스비만 지불)
 * - 일반적으로 수신자가 실행하여 포인트 수령
 */
export async function releaseEscrowedPoints(
  releaserSeed: string,
  ownerAddress: string,
  escrowSequence: number,
  mptIssuanceId: string
) {
  const client = new Client(process.env.XRPL_RPC_URL || 'wss://s.altnet.rippletest.net:51233');

  try {
    await client.connect();
    const releaserWallet = Wallet.fromSeed(releaserSeed);

    // 에스크로 상태 확인
    const status = await checkEscrowStatus(client, ownerAddress, escrowSequence);

    if (!status.exists) {
      throw new Error('Escrow not found');
    }

    if (!status.canFinish) {
      throw new Error(`Escrow cannot be finished yet. Available after: ${status.finishAfter}`);
    }

    const result = await finishMPTEscrow(
      client,
      releaserWallet,
      ownerAddress,
      escrowSequence,
      mptIssuanceId
    );

    return result;
  } finally {
    await client.disconnect();
  }
}

/**
 * 환불 시 에스크로 취소
 */
export async function refundEscrowedPoints(
  cancellerSeed: string,
  ownerAddress: string,
  escrowSequence: number,
  mptIssuanceId: string
) {
  const client = new Client(process.env.XRPL_RPC_URL || 'wss://s.altnet.rippletest.net:51233');

  try {
    await client.connect();
    const cancellerWallet = Wallet.fromSeed(cancellerSeed);

    // 에스크로 상태 확인
    const status = await checkEscrowStatus(client, ownerAddress, escrowSequence);

    if (!status.exists) {
      throw new Error('Escrow not found');
    }

    if (!status.canCancel) {
      throw new Error(`Escrow cannot be cancelled yet. Available after: ${status.cancelAfter}`);
    }

    const result = await cancelMPTEscrow(
      client,
      cancellerWallet,
      ownerAddress,
      escrowSequence,
      mptIssuanceId
    );

    return result;
  } finally {
    await client.disconnect();
  }
}