import {Client, Wallet} from "xrpl";

export async function WalletInfo(seed: string) {
    const client = new Client(process.env.XRPL_RPC_URL!)
    await client.connect()

    try {
        const wallet = Wallet.fromSeed(seed)
        const balance = client.getXrpBalance(wallet.address)

        return balance
    } catch (error) {
        // 오류 발생 시 로그 출력
        console.error("❌ 지갑 정보 조회 실패:", error)
    } finally {
        // 연결 종료
        await client.disconnect()
        console.log("🔄 연결 종료")
    }
}
