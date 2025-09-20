import {Client, Wallet} from "xrpl";

export async function getBalance(userSeed: string): Promise<Array<{ value: string; currency: string; issuer?: string | undefined }>>
{
    const client = new Client(process.env.XRPL_RPC_URL!);
    await client.connect()

    const user = Wallet.fromSeed(userSeed);

    const balance = await client.getBalances(user.address)
    console.log(balance)

    return balance
}