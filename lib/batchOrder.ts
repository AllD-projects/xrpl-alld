import { Client, Wallet } from "xrpl"

// 배치 모드 플래그
const tfAllOrNothing = 0x00010000
const tfInnerBatchTxn = 0x40000000 // 각 inner tx에 필수

type Build = {
    buyerSeed: string
    adminSeed: string
    companyAddress: string
    mptIssuanceId: string
    // drops 단위
    xrpPaymentDrops: string
    // 포인트 사용/적립 수량은 문자열(정수 문자열 권장)
    pointsToUse: string
    pointsToEarn: string
    // 초 단위 락 시간
    lockSecondsForUse: number
    lockSecondsForEarn: number
}

export async function submitOrderBatch(
    {
        buyerSeed,
        adminSeed,
        companyAddress,
        mptIssuanceId,
        xrpPaymentDrops,
        pointsToUse,
        pointsToEarn,
        lockSecondsForUse,
        lockSecondsForEarn,
    }: Build
) {
    const client = new Client(process.env.XRPL_RPC_URL!)
    await client.connect()

    try {
        // 1) 지갑·계정 정보
        const buyer = Wallet.fromSeed(buyerSeed)
        const admin = Wallet.fromSeed(adminSeed)

        // 2) 각 계정의 Sequence 확보 (inner tx에 필요)
        const buyerInfo = await client.request({
            command: "account_info",
            account: buyer.address,
            ledger_index: "validated",
        })
        const adminInfo = await client.request({
            command: "account_info",
            account: admin.address,
            ledger_index: "validated",
        })
        let buyerSeq = buyerInfo.result.account_data.Sequence as number
        let adminSeq = adminInfo.result.account_data.Sequence as number

        // 3) 내부 트랜잭션 3건 구성 (모두 Fee: "0", SigningPubKey: "", Flags: tfInnerBatchTxn)
        // 3-1) (포인트 사용) 구매자 → 회사 : MPT EscrowCreate (FinishAfter/CancelAfter는 createMPTEscrow에서 하던 로직 그대로 반영)
        const now = Math.floor(Date.now() / 1000)
        const usageEscrow = {
            RawTransaction: {
                TransactionType: "EscrowCreate",
                Flags: tfInnerBatchTxn,
                Account: buyer.address,
                Destination: companyAddress,
                Amount: {
                    // MPT Amount object
                    mpt_issuance_id: mptIssuanceId,
                    value: pointsToUse, // 정수 문자열 권장
                },
                // 환불 가능 기간 동안 락
                FinishAfter: now + lockSecondsForUse, // 락 해제 가능 시점
                CancelAfter: now + lockSecondsForUse + 60, // 선택: 안전 여유
                Sequence: buyerSeq++, // 각 계정별 독립 증가
                Fee: "0",
                SigningPubKey: "",
            },
        }

        // 3-2) (결제) 구매자 → 회사 : XRP Payment
        const payment = {
            RawTransaction: {
                TransactionType: "Payment",
                Flags: tfInnerBatchTxn,
                Account: buyer.address,
                Destination: companyAddress,
                Amount: xrpPaymentDrops, // drops 문자열
                Sequence: buyerSeq++,
                Fee: "0",
                SigningPubKey: "",
            },
        }

        // 3-3) (포인트 적립) 관리자(발행자) → 구매자 : MPT EscrowCreate
        const rewardEscrow = {
            RawTransaction: {
                TransactionType: "EscrowCreate",
                Flags: tfInnerBatchTxn,
                Account: admin.address,
                Destination: buyer.address,
                Amount: {
                    mpt_issuance_id: mptIssuanceId,
                    value: pointsToEarn,
                },
                FinishAfter: now + lockSecondsForEarn,
                CancelAfter: now + lockSecondsForEarn + 7 * 24 * 60 * 60, // 선택
                Sequence: adminSeq++,
                Fee: "0",
                SigningPubKey: "",
            },
        }

        // 4) 바깥 Batch 트랜잭션 작성 (Account=buyer, Flags=tfAllOrNothing)
        const outerBatchTx: any = {
            TransactionType: "Batch",
            Account: buyer.address,
            Flags: tfAllOrNothing, // ALL OR NOTHING
            RawTransactions: [usageEscrow, payment, rewardEscrow],
            // Fee/Sequence는 autofill에 맡김
        }

        // 5) outer autofill (outer Fee/Sequence 계산 + 필요 시 inner 해시 계산에 사용)
        const prepared = await client.autofill(outerBatchTx)

        // 6) 멀티 계정 배치이므로 BatchSigners 필요:
        //    - 바깥 Account(=buyer)는 바깥 TxnSignature로 서명
        //    - 나머지 계정(=admin)은 BatchSigners 항목에 별도 서명 필요
        //    6-1) 우선 바깥 트랜잭션 해시 대상(payload)을 계산해 admin이 서명할 원문을 얻는다.
        //    최신 xrpl.js는 BatchSigners 유틸리티가 생길 수 있으나, 일반적으로는 signTransaction을 raw로 처리.
        //    간단히 wallet.sign(prepared) 후, admin에 대해서는 client.request("sign_for", ...) 또는 지갑 로컬서명 사용.
        //    여기서는 로컬서명 예시로 TxnSignature만 생성해서 BatchSigners에 삽입한다.

        // --- admin용 임시 사인: sign(outer payload 전용) ---
        // xrpl.js는 공식적인 BatchSigners 헬퍼가 없을 수 있어 signFor 엔드포인트 사용 예시:
        const adminSigned = await client.request({
            command: "sign_for",
            account: admin.address,
            tx_json: prepared,
            secret: admin.seed, // 데모/해커톤용. 실제 운영에선 server-side signer/키보관 분리
        })

        // sign_for 응답에서 SigningPubKey / TxnSignature 취득
        const adminSigner = {
            BatchSigner: {
                Account: admin.address,
                SigningPubKey: adminSigned.result.tx_json.SigningPubKey,
                TxnSignature: adminSigned.result.tx_json.TxnSignature,
            },
        }

        // 7) buyer가 최종적으로 outer에 서명하되, BatchSigners를 포함해 제출
        const toSign = {
            ...prepared,
            BatchSigners: [adminSigner],
        }

        // buyer가 최종 서명
        const buyerSigned = Wallet.fromSeed(buyerSeed).sign(toSign)

        // 8) 제출 및 결과 대기
        const submitResult = await client.submitAndWait(buyerSigned.tx_blob)

        return submitResult
    } finally {
        await client.disconnect()
    }
}
