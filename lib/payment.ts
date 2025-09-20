import {Client, Payment, Wallet} from "xrpl";
import {TransactionMetadataBase} from "xrpl/src/models/transactions/metadata";

export async function sendXRP(user1Seed: string, user2Seed: string, amount: string) {
  const client = new Client(process.env.XRPL_RPC_URL!);
  await client.connect()

  const user1 = Wallet.fromSeed(user1Seed)
  const user2 = Wallet.fromSeed(user2Seed)

  const tx: Payment = {
    TransactionType: "Payment",
    Account: user1.address,       // 송신자
    Destination: user2.address,    // 수신자
    Amount: amount             // 전송 수량 (drops 단위, 1,000,000 drops = 1 XRP)
  }

  try {
    const prepared = await client.autofill(tx)
    const signed = user1.sign(prepared)
    const result = await client.submitAndWait(signed.tx_blob)

    // 트랜잭션 성공 여부 확인
    const out = result.result ?? result
    const transactionResult = out.meta?.TransactionResult

    if (transactionResult !== "tesSUCCESS") {
      console.error(`Payment failed with result: ${transactionResult}`)
      console.error('Full result:', JSON.stringify(out, null, 2))

      throw new Error(`Payment transaction failed: ${transactionResult || 'Unknown error'}`)
    }

    // 성공한 경우에만 결과 반환
    console.log(`✅ Payment successful: ${out.hash || out.tx_json?.hash}`)
    console.log(`   From: ${user1.address}`)
    console.log(`   To: ${user2.address}`)
    console.log(`   Amount: ${amount} drops`)

    return result
  } finally {
    // 연결 종료
    await client.disconnect()
  }
}