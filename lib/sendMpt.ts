import {Client, Transaction, Wallet} from "xrpl";

export async function sendMPT(userSeed: string, adminSeed: string, issuanceId: string, value: string) {
    const client = new Client(process.env.XRPL_RPC_URL!);
    await client.connect()

    const admin = Wallet.fromSeed(adminSeed);
    const user = Wallet.fromSeed(userSeed);

    const tx: Transaction = {
        TransactionType: "Payment",
        Account: admin.address,
        Destination: user.address,
        Amount: {
            mpt_issuance_id: issuanceId,  // 발행본 ID
            value: value                   // 전송 수량
        }
    }

    try {
        // 트랜잭션 준비 → 서명 → 제출
        const prepared = await client.autofill(tx)
        const signed   = admin.sign(prepared)
        const result   = await client.submitAndWait(signed.tx_blob)

        return result
    } finally {
        await client.disconnect()
        console.log("🔄 연결 종료")
    }
}