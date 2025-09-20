import {Client, Transaction, Wallet} from "xrpl";

export async function authorizeHolder(userSeed: string, adminSeed: string, issuanceId: string) {
    const client = new Client(process.env.XRPL_RPC_URL!);
    await client.connect()

    const admin = Wallet.fromSeed(adminSeed);
    const user = Wallet.fromSeed(userSeed);

    const optTx: Transaction = {
        TransactionType: "MPTokenAuthorize",
        Account: user.address,                 // User가 서명/전송
        MPTokenIssuanceID: issuanceId,        // MPT 발행 정의 ID
    }

    const tx: Transaction = {
        TransactionType: "MPTokenAuthorize",
        Account: admin.address,
        MPTokenIssuanceID: issuanceId,
        Holder: user.address
    }

    try {
        // 트랜잭션 준비 → 서명 → 제출
        const preparedOpt = await client.autofill(optTx)
        const signedOpt   = user.sign(preparedOpt)
        const resultOpt   = await client.submitAndWait(signedOpt.tx_blob)

        const prepared = await client.autofill(tx)
        const signed = admin.sign(prepared)
        const result = await client.submitAndWait(signed.tx_blob)

        // 전체 응답 로그 출력
        console.log(JSON.stringify(resultOpt, null, 2))
        return resultOpt
    } finally {
        await client.disconnect()
        console.log("🔄 연결 종료")
    }
}