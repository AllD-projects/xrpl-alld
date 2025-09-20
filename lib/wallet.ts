import { Wallet } from "xrpl";

export function createWallet() {
    try {
        // 1. 새 지갑 생성 — 랜덤하게 키쌍, 주소, 시드가 생성됨
        const newWallet = Wallet.generate()

        // 2. 콘솔 출력 — 생성된 지갑의 기본 정보 확인 가능
        //    ⚠️ 시드(seed)는 계정 권한 전체를 의미하므로 반드시 안전하게 보관 필요
        console.log('새 지갑 생성 완료')
        console.log(`주소: ${newWallet.address}`)     // r로 시작하는 XRPL 주소
        console.log(`시드: ${newWallet.seed}`)        // s로 시작하는 XRPL 시드
        console.log(`공개키: ${newWallet.publicKey}`) // 33바이트 hex 형식 공개키

        // 3. 함수 반환 — 다른 스크립트에서 불러 쓸 수 있도록 객체 형태로 반환
        return {
            classicAddress: newWallet.classicAddress,
            publicKey: newWallet.publicKey,
            seedPlain: newWallet.seed!,
        }
    } catch (error) {
        // 예외 처리 — Wallet.generate() 자체는 거의 실패하지 않지만 런타임 예외 대비
        console.error('❌ 새 지갑 생성 실패:', error)
        throw new Error(`새 지갑 생성 실패: ${error}`)
    }
}