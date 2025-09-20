# 🚀 XRPL Web3 Payment System API Documentation

XRPL 기반 Web3 결제 시스템의 모든 API 엔드포인트에 대한 상세 문서입니다.

## 📋 목차

1. [인증 API](#-인증-api)
2. [관리자 API](#-관리자-api)
3. [게시글 API](#-게시글-api)
4. [NFT API](#-nft-api)
5. [기부 API](#-기부-api)
6. [상품 API](#-상품-api)
7. [주문 API](#-주문-api)
8. [구독 API](#-구독-api)

---

## 🔐 인증 API

### 회원가입
**POST** `/api/auth/signup`

```json
{
  "email": "user@example.com",
  "password": "password123",
  "displayName": "사용자명",
  "role": "USER" // USER | COMPANY
}
```

**응답:**
```json
{
  "ok": true,
  "message": "Account created successfully",
  "account": {
    "id": "account_id",
    "email": "user@example.com",
    "displayName": "사용자명",
    "role": "USER"
  }
}
```

### 로그인
**POST** `/api/auth/login`

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**응답:**
```json
{
  "ok": true,
  "token": "jwt_token_here",
  "account": {
    "id": "account_id",
    "email": "user@example.com",
    "displayName": "사용자명",
    "role": "USER"
  }
}
```

### 로그아웃
**POST** `/api/auth/logout`
- 헤더: `Authorization: Bearer {token}`

### 내 정보 조회
**GET** `/api/auth/me`
- 헤더: `Authorization: Bearer {token}`

---

## 👑 관리자 API

### 시스템 초기화
**POST** `/api/admin/init`

```json
{
  "adminEmail": "admin@example.com",
  "adminPassword": "admin123",
  "adminDisplayName": "관리자"
}
```

### 회사 승인
**POST** `/api/admin/companies/{id}/approve`
- 헤더: `Authorization: Bearer {admin_token}`

```json
{
  "action": "approve", // approve | reject
  "note": "승인 사유"
}
```

---

## 📝 게시글 API

### 게시글 생성
**POST** `/api/posts`
- 헤더: `Authorization: Bearer {token}`

**JSON 방식:**
```json
{
  "title": "게시글 제목",
  "description": "게시글 내용"
}
```

**파일 업로드 방식:**
```
Content-Type: multipart/form-data

title: 게시글 제목
description: 게시글 내용
files: [이미지 파일들]
```

### 게시글 목록 조회
**GET** `/api/posts`

**쿼리 파라미터:**
- `page`: 페이지 번호 (기본값: 1)
- `limit`: 페이지 크기 (기본값: 10, 최대: 50)
- `authorId`: 특정 작성자의 게시글만 조회
- `postId`: 특정 게시글 조회

### 게시글 수정
**PUT** `/api/posts`
- 헤더: `Authorization: Bearer {token}`

```json
{
  "postId": "post_id",
  "title": "수정된 제목",
  "description": "수정된 내용"
}
```

### 게시글 삭제 (비활성화)
**DELETE** `/api/posts?postId={postId}`
- 헤더: `Authorization: Bearer {token}`

### 게시글 이미지 업로드
**POST** `/api/posts/{postId}/images`
- 헤더: `Authorization: Bearer {token}`
- Content-Type: `multipart/form-data`

---

## 🎨 NFT API

### 게시글 NFT 발행
**POST** `/api/posts/{postId}/nft`
- 헤더: `Authorization: Bearer {token}`

### 게시글 NFT 정보 조회
**GET** `/api/posts/{postId}/nft`

**쿼리 파라미터:**
- `action=check_copyright`: 저작권 침해 검사
- `action=certificate`: 저작권 증명서 생성

### NFT 관리 (전송, 라이선스, 소각)
**POST** `/api/nft`
- 헤더: `Authorization: Bearer {token}`

**NFT 전송:**
```json
{
  "action": "transfer",
  "nftId": "nft_id",
  "toUserId": "recipient_user_id",
  "price": "1000000" // XRP drops (선택사항)
}
```

**라이선스 생성:**
```json
{
  "action": "create_license",
  "nftId": "nft_id",
  "licenseeId": "licensee_user_id",
  "licenseType": "COMMERCIAL_USE", // PERSONAL_USE | COMMERCIAL_USE | EXCLUSIVE_USE | ATTRIBUTION_REQUIRED
  "price": "500000", // XRP drops (선택사항)
  "duration": 30 // 일수 (선택사항)
}
```

**라이선스 취소:**
```json
{
  "action": "revoke_license",
  "licenseId": "license_id"
}
```

**NFT 소각:**
```json
{
  "action": "burn",
  "nftId": "nft_id"
}
```

### NFT 목록 조회
**GET** `/api/nft`

**쿼리 파라미터:**
- `ownerId`: 특정 소유자의 NFT만 조회
- `page`: 페이지 번호
- `limit`: 페이지 크기

---

## 🎁 기부 API

### 게시글에 기부하기
**POST** `/api/posts/{postId}/donate`
- 헤더: `Authorization: Bearer {token}`

**XRP 기부:**
```json
{
  "type": "XRP",
  "amount": "1000000", // XRP drops
  "message": "응원 메시지" // 선택사항
}
```

**MPT 포인트 기부:**
```json
{
  "type": "MPT",
  "amount": "100000000", // MPT 수량
  "currency": "FASHIONPOINT",
  "message": "응원 메시지" // 선택사항
}
```

### 게시글 기부 통계 조회
**GET** `/api/posts/{postId}/donate`

### 사용자 기부 내역 조회
**GET** `/api/donations`
- 헤더: `Authorization: Bearer {token}`

**쿼리 파라미터:**
- `page`: 페이지 번호
- `limit`: 페이지 크기
- `userId`: 다른 사용자 기부 내역 조회 (관리자만)

### 관리자용 기부 통계
**POST** `/api/donations`
- 헤더: `Authorization: Bearer {admin_token}`

```json
{
  "action": "stats",
  "startDate": "2024-01-01", // 선택사항
  "endDate": "2024-12-31" // 선택사항
}
```

---

## 🛍️ 상품 API

### 상품 생성
**POST** `/api/products`
- 헤더: `Authorization: Bearer {company_token}`

```json
{
  "title": "상품명",
  "description": "상품 설명",
  "priceDrops": "5000000", // XRP drops
  "returnDays": 7,
  "images": ["image_url1", "image_url2"]
}
```

### 상품 목록 조회
**GET** `/api/products`

**쿼리 파라미터:**
- `page`: 페이지 번호
- `limit`: 페이지 크기
- `companyId`: 특정 회사의 상품만 조회

### 상품 상세 조회
**GET** `/api/products/{id}`

### 상품 수정
**PUT** `/api/products/{id}`
- 헤더: `Authorization: Bearer {company_token}`

### 상품 삭제
**DELETE** `/api/products/{id}`
- 헤더: `Authorization: Bearer {company_token}`

---

## 🛒 주문 API

### 주문 관리
**POST** `/api/orders`
- 헤더: `Authorization: Bearer {token}`

**주문 생성:**
```json
{
  "action": "create",
  "productId": "product_id",
  "quantity": 1,
  "usePointAmt": "0" // 사용할 포인트 (drops)
}
```

**주문 결제:**
```json
{
  "action": "pay",
  "orderId": "order_id"
}
```

**주문 완료:**
```json
{
  "action": "complete",
  "orderId": "order_id"
}
```

**주문 환불:**
```json
{
  "action": "refund",
  "orderId": "order_id"
}
```

### 주문 목록 조회
**GET** `/api/orders`
- 헤더: `Authorization: Bearer {token}`

**쿼리 파라미터:**
- `page`: 페이지 번호
- `limit`: 페이지 크기
- `status`: 주문 상태 필터

---

## 📋 구독 API

### 구독 관리
**POST** `/api/subscriptions`
- 헤더: `Authorization: Bearer {company_token}`

**구독 생성:**
```json
{
  "action": "subscribe",
  "planName": "Pro" // Pro | Enterprise
}
```

**구독 취소:**
```json
{
  "action": "cancel"
}
```

### 구독 정보 조회
**GET** `/api/subscriptions`

**쿼리 파라미터:**
- `action=plans`: 사용 가능한 플랜 목록 조회
- `action=my`: 내 구독 정보 조회 (인증 필요)

---

## 🔑 인증 헤더

모든 보호된 엔드포인트에는 다음 헤더가 필요합니다:

```
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
```

## 📊 응답 형식

### 성공 응답
```json
{
  "success": true,
  "data": {
    // 응답 데이터
  },
  "message": "성공 메시지"
}
```

### 에러 응답
```json
{
  "error": "에러 메시지",
  "details": "상세 에러 정보" // 선택사항
}
```

## 🚀 사용자 역할

- **USER**: 일반 사용자 (게시글 작성, NFT 발행, 기부, 상품 구매)
- **COMPANY**: 기업 사용자 (상품 판매, 구독 서비스 이용, 기부)
- **ADMIN**: 관리자 (시스템 관리, 회사 승인, 전체 통계 조회)

## 💰 통화 단위

- **XRP**: drops 단위 (1 XRP = 1,000,000 drops)
- **MPT**: 발행된 토큰 단위 (소수점 6자리 지원)

## 🔒 보안 고려사항

- 모든 지갑 시드는 암호화되어 저장
- JWT 토큰을 통한 인증
- 트랜잭션은 XRPL 블록체인에 기록
- 민감한 정보는 로그에 기록하지 않음

---

> 💡 **참고**: 이 API는 XRPL Testnet을 사용하며, 실제 자산이 아닌 테스트용 토큰을 사용합니다.