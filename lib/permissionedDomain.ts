import {Client, Transaction, Wallet} from "xrpl";

const toHex = (s: string) => Buffer.from(s, "utf8").toString("hex")

export async function createDomain(seed: string) {
    const client = new Client(process.env.XRPL_RPC_URL!)
    await client.connect()

    const w = Wallet.fromSeed(seed)

    try {
        const tx: Transaction = {
            TransactionType: "PermissionedDomainSet",
            Account: w.address,
            AcceptedCredentials: [
                {
                    Credential: {
                        Issuer: w.address,
                        CredentialType: toHex("AllD"),
                    }
                }
            ]
        }

        const prepared = await client.autofill(tx)
        const signed = w.sign(prepared)

        const result: any = await client.submitAndWait(signed.tx_blob)
        console.log(JSON.stringify(result, null, 2))


        const out = result.result ?? result
        const created = (out.meta?.AffectedNodes || []).find(
            (n: any) => n.CreateNode?.LedgerEntryType === "PermissionedDomain"
        )
        const domainId =
            created?.CreatedNode?.LedgerIndex ||
            created?.CreatedNode?.NewFields?.DomainID ||
            null

        if (domainId) {
            console.log("✅ DomainID(created):", domainId)
        } else {
            console.warn("⚠️ Could not locate DomainID in meta. Check node support/fields.")
        }

        return domainId
    } catch (err) {
        console.error("❌ 도메인 생성 실패:", err)
        throw err
    } finally {
        await client.disconnect()
        console.log("🔄 연결 종료")
    }
}