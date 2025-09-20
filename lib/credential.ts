import {Client, CredentialCreate, Wallet} from "xrpl";

const toHex = (s: string) => Buffer.from(s, "utf8").toString("hex")

export async function createCredential(userSeed: string, adminSeed: string) {
    const client = new Client(process.env.XRPL_RPC_URL!);
    await client.connect()

    try {
        const issuer = Wallet.fromSeed(adminSeed);
        const subject = Wallet.fromSeed(userSeed);

        const tx: CredentialCreate = {
            TransactionType: "CredentialCreate",
            Account: issuer.address,
            Subject: subject.address,
            CredentialType: toHex("AllD")
        }

        const prepared = await client.autofill(tx)
        const signed = issuer.sign(prepared)

        const res = await client.submitAndWait(signed.tx_blob)
        return res.result
    } catch (err) {
        console.error("❌ Credential 발급 실패:", err)
        throw err
    } finally {
        await client.disconnect()
        console.log("🔄 연결 종료")
    }
}