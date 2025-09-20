import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import { createWallet } from "@/lib/wallet";
import { faucet } from "@/lib/faucet";
import { Role, WalletKind } from "@prisma/client";
import {createDomain} from "@/lib/permissionedDomain";
import {createIssuance} from "@/lib/createIssuance";
import { initializeSubscriptionPlans } from '@/lib/subscription-plans';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action = 'admin_setup' } = body;

        switch (action) {
            case 'admin_setup': {
                // 이미 초기화 되었는지 확인
                const existingConfig = await prisma.globalConfig.findFirst({
                    include: { adminAccount: true, adminIssuerWallet: true },
                });
                if (existingConfig) {
                    return NextResponse.json({
                        ok: true,
                        message: "Already initialized",
                        admin: {
                            email: existingConfig.adminAccount.email,
                            issuerAddress: existingConfig.adminIssuerWallet?.classicAddress,
                        },
                    });
                }

                // 1. 관리자 계정 생성
                const email = "admin@example.com";
                const password = "Admin#1234"; // 해커톤용 기본 비번
                const passwordHash = await bcrypt.hash(password, 10);

                const adminAccount = await prisma.account.create({
                    data: {
                        email,
                        displayName: "Administrator",
                        role: Role.ADMIN,
                        passwordHash,
                    },
                });

                // 2. 관리자 발행 지갑 생성
                const w = createWallet();

                // 3. Devnet 펀딩
                await faucet(w.seedPlain);

                const wallet = await prisma.wallet.create({
                    data: {
                        ownerAccountId: adminAccount.id,
                        kind: WalletKind.ADMIN_ISSUER,
                        classicAddress: w.classicAddress,
                        publicKey: w.publicKey,
                        seedCipher: w.seedPlain, // ⚠️ 데모용 그대로 저장
                        label: "Admin Issuer Wallet",
                    },
                });

                const domainSetTx = await createDomain(w.seedPlain);
                const issuanceId = await createIssuance(w.seedPlain);

                // 4. GlobalConfig 등록
                const config = await prisma.globalConfig.create({
                    data: {
                        adminAccountId: adminAccount.id,
                        adminIssuerWalletId: wallet.id,
                        mptIssuanceId: issuanceId
                    },
                });

                // 5. 구독 플랜 초기화
                await initializeSubscriptionPlans();

                return NextResponse.json({
                    ok: true,
                    message: "Admin initialized with subscription plans",
                    admin: {
                        email: adminAccount.email,
                        password: "(set in code, check server log)",
                    },
                    issuer: {
                        address: wallet.classicAddress,
                    },
                });
            }

            case 'subscription_plans': {
                // 구독 플랜만 초기화
                await initializeSubscriptionPlans();

                const plans = await prisma.plan.findMany({
                    orderBy: { priceDrops: 'asc' }
                });

                return NextResponse.json({
                    ok: true,
                    message: 'Subscription plans initialized successfully',
                    plans: plans
                });
            }

            case 'test_data': {
                // 테스트 데이터 생성
                await initializeSubscriptionPlans();

                // 테스트 회사 계정 생성
                const testCompanyAccount = await prisma.account.upsert({
                    where: { email: 'test-company@example.com' },
                    update: {},
                    create: {
                        email: 'test-company@example.com',
                        displayName: 'Test Company',
                        role: Role.COMPANY,
                        passwordHash: await bcrypt.hash('Company#1234', 10),
                    }
                });

                // 테스트 회사 생성
                const testCompany = await prisma.company.upsert({
                    where: { ownerId: testCompanyAccount.id },
                    update: {},
                    create: {
                        ownerId: testCompanyAccount.id,
                        name: 'Test Fashion Store',
                        domain: 'testfashion.com'
                    }
                });

                // 테스트 사용자 계정 생성
                const testUserAccount = await prisma.account.upsert({
                    where: { email: 'test-user@example.com' },
                    update: {},
                    create: {
                        email: 'test-user@example.com',
                        displayName: 'Test User',
                        role: Role.USER,
                        passwordHash: await bcrypt.hash('User#1234', 10),
                    }
                });

                // 테스트 상품 생성
                const existingProduct = await prisma.product.findFirst({
                    where: { companyId: testCompany.id }
                });

                if (!existingProduct) {
                    await prisma.product.create({
                        data: {
                            companyId: testCompany.id,
                            title: 'Premium T-Shirt',
                            description: 'High quality cotton t-shirt',
                            priceDrops: '10000000', // 10 XRP
                            returnDays: 7,
                            active: true
                        }
                    });
                }

                const stats = {
                    plans: await prisma.plan.count(),
                    accounts: await prisma.account.count(),
                    companies: await prisma.company.count(),
                    products: await prisma.product.count()
                };

                return NextResponse.json({
                    ok: true,
                    message: 'Test data created successfully',
                    stats: stats,
                    testAccounts: {
                        company: { email: 'test-company@example.com', password: 'Company#1234' },
                        user: { email: 'test-user@example.com', password: 'User#1234' }
                    }
                });
            }

            case 'status': {
                // 시스템 상태 확인
                const [
                    accountCount,
                    companyCount,
                    productCount,
                    planCount,
                    subscriptionCount,
                    orderCount,
                    globalConfig
                ] = await Promise.all([
                    prisma.account.count(),
                    prisma.company.count(),
                    prisma.product.count(),
                    prisma.plan.count(),
                    prisma.subscription.count(),
                    prisma.order.count(),
                    prisma.globalConfig.findFirst()
                ]);

                return NextResponse.json({
                    ok: true,
                    status: {
                        accounts: accountCount,
                        companies: companyCount,
                        products: productCount,
                        plans: planCount,
                        subscriptions: subscriptionCount,
                        orders: orderCount,
                        hasGlobalConfig: !!globalConfig,
                        isInitialized: !!globalConfig
                    }
                });
            }

            default:
                return NextResponse.json(
                    { ok: false, error: 'Invalid action' },
                    { status: 400 }
                );
        }
    } catch (err: any) {
        return NextResponse.json(
            { ok: false, error: err?.message ?? "Init failed" },
            { status: 500 }
        );
    }
}
