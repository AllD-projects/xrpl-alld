import { Client, Wallet } from 'xrpl';

export interface BatchPaymentItem {
  destination: string;
  amount: string; // in drops
}

export async function sendBatchXRP(
  senderSeed: string,
  payments: BatchPaymentItem[]
) {
  const client = new Client(process.env.XRPL_RPC_URL!);
  await client.connect();

  try {
    const user = Wallet.fromSeed(senderSeed);

    // 현재 계정의 최신 시퀀스 번호 조회
    const ai = await client.request({
      command: "account_info",
      account: user.address
    });
    const seq = ai.result.account_data.Sequence;

    // RawTransactions 배열 생성
    const rawTransactions = payments.map((payment, index) => ({
      RawTransaction: {
        TransactionType: "Payment",
        Flags: 0x40000000, // tfInnerBatchTxn
        Account: user.address,
        Destination: payment.destination,
        Amount: payment.amount,
        Sequence: seq + index + 1,
        Fee: "0",
        SigningPubKey: ""
      }
    }));

    const tx: any = {
      TransactionType: "Batch",
      Account: user.address,
      Flags: 0x00010000, // AllOrNothing
      RawTransactions: rawTransactions,
      Sequence: seq
    };

    // 트랜잭션 준비 및 서명
    const prepared = await client.autofill(tx);
    const signed = user.sign(prepared);

    // 트랜잭션 제출
    const result = await client.submitAndWait(signed.tx_blob);

    return {
      success: true,
      result: result,
      txHash: result.result.hash,
      sequence: seq
    };

  } catch (error) {
    console.error('Batch payment error:', error);
    throw error;
  } finally {
    await client.disconnect();
  }
}