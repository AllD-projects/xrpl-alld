import {Client, Transaction, Wallet} from "xrpl";

const toHex = (s: string) => Buffer.from(s, "utf8").toString("hex")

export async function acceptCredential(userSeed: string, adminSeed: string) {
    const client = new Client(process.env.XRPL_RPC_URL!);
    await client.connect()

    try {
        const issuer = Wallet.fromSeed(adminSeed);
        const subject = Wallet.fromSeed(userSeed);

        const tx: Transaction = {
            TransactionType: "CredentialAccept",
            Account: subject.address, // ✅ 피발급자 서명/전송
            Issuer: issuer.address,
            CredentialType: toHex("AllD")
        }

        const prepared = await client.autofill(tx)
        const signed = subject.sign(prepared)

        const res = await client.submitAndWait(signed.tx_blob)
        return res.result
    } catch (err) {
        console.error("❌ Credential 수락 실패:", err)
        throw err
    } finally {
        await client.disconnect()
        console.log("🔄 연결 종료")
    }
}