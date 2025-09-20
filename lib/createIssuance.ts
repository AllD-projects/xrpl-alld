import {Client, Transaction, Wallet} from "xrpl";

export async function createIssuance(seed: string) {
    const client = new Client(process.env.XRPL_RPC_URL!);
    await client.connect()

    const admin = Wallet.fromSeed(seed)

    const tx: Transaction = {
        TransactionType: "MPTokenIssuanceCreate",
        Account: admin.address,
        AssetScale: 0,                            // 소수점 없음
        MaximumAmount: "9223372036854775807",              // 최대 발행량 (옵션)
        Flags: {                                  // 정책 예시
            tfMPTCanLock: true,
            tfMPTCanTransfer: true,                 // 전송 가능
            tfMPTCanEscrow: true,                   // 에스크로 가능
            tfMPTRequireAuth: true,                 // 권한 필요 X
            tfMPTCanTrade: false,
            tfMPTCanClawback: true
        },
    }

    try {
        const prepared = await client.autofill(tx)
        const signed   = admin.sign(prepared)
        const result   = await client.submitAndWait(signed.tx_blob)

        const issuanceId48 = (result.result.meta as any)?.mpt_issuance_id
        if (issuanceId48) {
            console.log(`IssuanceID(created): ${issuanceId48}`)
        } else {
            console.log("⚠️ IssuanceID를 meta에서 찾지 못했습니다. 응답 로그 확인 필요.")
        }

        return issuanceId48
    } finally {
        await client.disconnect()
        console.log("🔄 연결 종료")
    }
}