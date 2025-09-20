import {Client, Wallet} from "xrpl";

export async function faucet(seed: string) {
    const client = new Client(process.env.XRPL_RPC_URL!)
    await client.connect();

    try {
        const wallet = Wallet.fromSeed(seed);
        await client.fundWallet(wallet);
        console.log(`✅ USER (${wallet.address}) 계정 활성화 완료`)
    } catch (err) {
        // faucet 호출 실패 시 오류 출력
        console.error("❌ 계정 활성화 중 오류:", err)
    } finally {
        // 항상 연결 종료
        await client.disconnect()
        console.log("🔄 연결 종료")
    }
}
