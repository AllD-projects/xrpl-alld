import {Client, Transaction, Wallet} from "xrpl";

export async function setIssuance(holderAddress: string, adminSeed: string, issuanceId: string, lock: boolean) {
    const client = new Client(process.env.XRPL_RPC_URL!);
    await client.connect()

    const flags = lock ? { tfMPTLock: true } : { tfMPTUnlock: true }
    const admin = Wallet.fromSeed(adminSeed)


    const tx: Transaction = {
        TransactionType: "MPTokenIssuanceSet",
        Account: admin.address,            // 발행자(ADMIN) 서명/전송
        MPTokenIssuanceID: issuanceId,    // createIssuance 결과로 얻은 발행 정의 ID
        holder: holderAddress,
        Flags: flags
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