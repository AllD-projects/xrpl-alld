import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

import {
  createPointUsageEscrow,
  createPointRewardEscrow,
  releaseEscrowedPoints,
  refundEscrowedPoints
} from '@/lib/escrow';
import {requireAuth} from "@/lib/auth";
import {Wallet} from "xrpl";
import {getBalance} from "@/lib/getBalance";
import {sendXRP} from "@/lib/payment";
import {sendBatchXRP, BatchPaymentItem} from "@/lib/batchPayment";

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const me = await requireAuth()

    const userId = me.id;

    const body = await request.json();
    const { action, ...params } = body;

    switch (action) {
      case 'create': {
        const { productId, quantity = 1, usePoints = 0 } = params;

        const [user, product, globalConfig] = await Promise.all([
          prisma.account.findUnique({
            where: { id: userId },
            include: { wallet: true }
          }),
          prisma.product.findUnique({
            where: { id: productId },
            include: { company: { include: { wallet: true } } }
          }),
          prisma.globalConfig.findFirst({
            include: { adminIssuerWallet: true }
          })
        ]);

        if (!user || !product || !globalConfig) {
          return NextResponse.json(
            { error: 'Invalid user, product, or system configuration' },
            { status: 400 }
          );
        }
        const userWallet = Wallet.fromSeed(user.wallet!.seedCipher!)

        const totalAmount = parseInt(product.priceDrops) * quantity;

        // 실제 XRPL에서 MPT 잔액 조회
        const availablePoint = Number(
            (await getBalance(user.wallet!.seedCipher!))
                .find(b => b.currency === "MPT")?.value ?? 0
        ) || 0;

        // const pointsToUse = Math.min(usePoints, availablePoint) / 1000;
        // console.log(`Points to use: ${pointsToUse} (requested: ${usePoints}, available: ${availablePoint})`)
        const finalAmount = totalAmount - usePoints;
        const pointsToEarn = Math.floor(finalAmount * 0.05) / 1000;

        const order = await prisma.order.create({
          data: {
            buyerId: userId,
            productId: productId,
            quantity: quantity,
            unitPriceDrops: product.priceDrops,
            totalDrops: finalAmount.toString(),
            usePointAmt: usePoints.toString(),
            status: 'CREATED'
          }
        });

        // // �x� �� Фl\ �1
        // if (pointsToUse > 0 && user.wallet?.seedCipher && product.company.wallet && globalConfig.mptIssuanceId) {
        //   try {
        //     const escrowResult = await createPointUsageEscrow(
        //       user.wallet.seedCipher,
        //       product.company.wallet.classicAddress,
        //       globalConfig.mptIssuanceId,
        //       pointsToUse.toString(),
        //       product.returnDays
        //     );
        //
        //     await prisma.pointEscrow.create({
        //       data: {
        //         accountId: userId,
        //         orderId: order.id,
        //         mptCode: globalConfig.mptCode,
        //         issuer: user.wallet.classicAddress,
        //         amountStr: pointsToUse.toString(),
        //         finishAfter: escrowResult.finishAfter,
        //         cancelAfter: escrowResult.cancelAfter,
        //         status: 'CREATED',
        //         createTx: `${escrowResult.txHash}:${escrowResult.sequence}`
        //       }
        //     });
        //   } catch (error) {
        //     console.error('Failed to create point usage escrow:', error);
        //   }
        // }

        return NextResponse.json({
          orderId: order.id,
          totalAmount: finalAmount,
          pointsUsed: usePoints,
          pointsToEarn: pointsToEarn,
          status: order.status
        });
      }

      case 'pay': {
        const { orderId } = params;

        const order = await prisma.order.findUnique({
          where: { id: orderId },
          include: {
            buyer: { include: { wallet: true } },
            product: { include: { company: { include: { wallet: true } } } }
          }
        });


        const globalConfig = await prisma.globalConfig.findFirst({
          include: { adminIssuerWallet: true }
        });
        const pointsToEarn = Math.floor(order.totalDrops * 0.05) / 1000;
        const pointsToUse = order.usePointAmt

        const escrowResult = await createPointUsageEscrow(
            order.buyer.wallet.seedCipher,
            order.product.company.wallet.classicAddress,
            globalConfig.mptIssuanceId,
            pointsToUse.toString(),
            order.product.returnDays
        );

        await prisma.pointEscrow.create({
          data: {
            accountId: order.buyer.id,
            orderId: order.id,
            mptCode: globalConfig.mptCode,
            issuer: order.buyer.wallet.classicAddress,
            amountStr: pointsToUse.toString(),
            finishAfter: escrowResult.finishAfter,
            cancelAfter: escrowResult.cancelAfter,
            status: 'CREATED',
            createTx: `${escrowResult.txHash}:${escrowResult.sequence}`
          }
        });

        if (!order || order.status !== 'CREATED') {
          return NextResponse.json(
            { error: 'Invalid order or order already processed' },
            { status: 400 }
          );
        }

        const payment = await sendXRP(order.buyer.wallet!.seedCipher!, order.product.company.wallet!.seedCipher!, order.totalDrops)
        const txHash = payment.result?.tx_json?.TxnSignature as string | undefined;
        if (!txHash || typeof txHash !== "string" || txHash.length === 0) {
          // 필요하면 res 전체를 로깅해서 왜 hash가 없는지 확인
          console.error("createCredential returned no tx hash:", payment.result);
          return NextResponse.json(
              { ok: false, error: "Credential transaction failed (no txHash)" },
              { status: 502 },
          );
        }

        await prisma.$transaction(async (tx) => {
          await tx.payment.create({
            data: {
              orderId: orderId,
              currency: 'XRP',
              amountDrops: order.totalDrops,
              payerAddr: order.buyer.wallet!.classicAddress,
              payTxHash: txHash,
              status: 'PAID'
            }
          });

          await tx.order.update({
            where: { id: orderId },
            data: { status: 'PAID' }
          });

          await tx.orderEvent.create({
            data: {
              orderId: orderId,
              type: 'PAYMENT_RECEIVED',
              note: `Payment received: ${order.totalDrops} drops`
            }
          });

          // �x� � Фl\ �1
          const pointsEarned = Math.floor(parseInt(order.totalDrops) * 0.05) / 1000;

          if (globalConfig?.adminIssuerWallet?.seedCipher &&
              order.buyer.wallet &&
              pointsEarned > 0 &&
              globalConfig.mptIssuanceId) {
            try {
              console.log('🔄 Creating point reward escrow...');
              const escrowResult = await createPointRewardEscrow(
                globalConfig.adminIssuerWallet.seedCipher,
                order.buyer.wallet.classicAddress,
                globalConfig.mptIssuanceId,
                pointsEarned.toString(),
                order.product.returnDays
              );

              await tx.pointEscrow.create({
                data: {
                  accountId: order.buyerId,
                  orderId: orderId,
                  mptCode: globalConfig.mptCode,
                  issuer: globalConfig.adminIssuerWallet.classicAddress,
                  amountStr: pointsEarned.toString(),
                  finishAfter: escrowResult.finishAfter,
                  cancelAfter: escrowResult.cancelAfter,
                  status: 'CREATED',
                  createTx: `${escrowResult.txHash}:${escrowResult.sequence}`
                }
              });

              await tx.pointLedger.create({
                data: {
                  accountId: order.buyerId,
                  type: 'EARN',
                  amount: pointsEarned.toString(),
                  mptCode: globalConfig.mptCode,
                  issuer: globalConfig.adminIssuerWallet.classicAddress,
                  note: `Points earned from order ${orderId} (locked until ${escrowResult.finishAfter.toISOString()})`
                }
              });
            } catch (error) {
              console.error('Failed to create point reward escrow:', error);
            }
          }
        },
            {
              maxWait: 5000,   // 잠금 대기 최대 시간
              timeout: 30000,  // 트랜잭션 최대 실행 시간(예: 30초)
            }
        );

        return NextResponse.json({
          success: true,
          message: 'Payment processed successfully'
        });
      }

      case 'complete': {
        const { orderId } = params;

        const order = await prisma.order.findUnique({
          where: { id: orderId },
          include: {
            escrows: true,
            buyer: { include: { wallet: true } }
          }
        });

        if (!order || order.status !== 'PAID') {
          return NextResponse.json(
            { error: 'Order not found or not in PAID status' },
            { status: 400 }
          );
        }

        const now = new Date();
        const readyEscrows = order.escrows.filter(
          e => e.status === 'CREATED' && new Date(e.finishAfter) <= now
        );

        if (readyEscrows.length === 0) {
          return NextResponse.json(
            { error: 'No escrows ready to be released' },
            { status: 400 }
          );
        }

        const globalConfig = await prisma.globalConfig.findFirst({
          include: { adminIssuerWallet: true }
        });

        if (!globalConfig?.adminIssuerWallet?.seedCipher || !globalConfig.mptIssuanceId) {
          return NextResponse.json(
            { error: 'System configuration error' },
            { status: 500 }
          );
        }

        let releasedCount = 0;
        let totalReleased = 0;

        for (const escrow of readyEscrows) {
          try {
            const [, sequence] = (escrow.createTx || ':').split(':');
            const escrowSequence = parseInt(sequence);

            const result = await releaseEscrowedPoints(
              globalConfig.adminIssuerWallet.seedCipher,
              escrow.issuer,
              escrowSequence,
              globalConfig.mptIssuanceId
            );

            await prisma.pointEscrow.update({
              where: { id: escrow.id },
              data: {
                status: 'RELEASED',
                finishTx: result.txHash
              }
            });

            await prisma.pointLedger.create({
              data: {
                accountId: order.buyerId,
                type: 'EARN',
                amount: escrow.amountStr,
                mptCode: globalConfig.mptCode,
                issuer: globalConfig.adminIssuerWallet.classicAddress,
                note: `Points unlocked from order ${orderId}`
              }
            });

            releasedCount++;
            totalReleased += parseInt(escrow.amountStr);
          } catch (error) {
            console.error(`Failed to release escrow ${escrow.id}:`, error);
          }
        }

        if (releasedCount > 0) {
          await prisma.order.update({
            where: { id: orderId },
            data: { status: 'RELEASED' }
          });

          await prisma.orderEvent.create({
            data: {
              orderId: orderId,
              type: 'ESCROW_RELEASED',
              note: `Released ${releasedCount} escrow(s)`
            }
          });
        }

        return NextResponse.json({
          success: true,
          message: `Released ${releasedCount} of ${readyEscrows.length} escrow(s)`,
          releasedAmount: totalReleased
        });
      }

      case 'refund': {
        const { orderId, reason } = params;

        const order = await prisma.order.findUnique({
          where: { id: orderId },
          include: {
            escrows: true,
            product: true
          }
        });

        if (!order) {
          return NextResponse.json(
            { error: 'Order not found' },
            { status: 404 }
          );
        }

        const now = new Date();
        const orderAge = (now.getTime() - order.createdAt.getTime()) / (1000 * 60 * 60 * 24);

        if (orderAge > order.product.returnDays) {
          return NextResponse.json(
            { error: 'Refund period has expired' },
            { status: 400 }
          );
        }

        const globalConfig = await prisma.globalConfig.findFirst({
          include: { adminIssuerWallet: true }
        });

        await prisma.$transaction(async (tx) => {
          await tx.order.update({
            where: { id: orderId },
            data: { status: 'REFUNDED' }
          });

          // Фl\ �
          for (const escrow of order.escrows) {
            if (escrow.status === 'CREATED') {
              try {
                const [, sequence] = (escrow.createTx || ':').split(':');
                const escrowSequence = parseInt(sequence);

                if (globalConfig?.adminIssuerWallet?.seedCipher && globalConfig.mptIssuanceId) {
                  await refundEscrowedPoints(
                    globalConfig.adminIssuerWallet.seedCipher,
                    escrow.issuer,
                    escrowSequence,
                    globalConfig.mptIssuanceId
                  );
                }

                await tx.pointEscrow.update({
                  where: { id: escrow.id },
                  data: { status: 'CANCELED' }
                });
              } catch (error) {
                console.error(`Failed to cancel escrow ${escrow.id}:`, error);
              }
            }
          }

          await tx.orderEvent.create({
            data: {
              orderId: orderId,
              type: 'REFUNDED',
              note: reason || 'Customer requested refund'
            }
          });

          // ��\ �x� X�
          if (parseInt(order.usePointAmt) > 0) {
            await tx.pointLedger.create({
              data: {
                accountId: order.buyerId,
                type: 'REFUND',
                amount: order.usePointAmt,
                mptCode: globalConfig?.mptCode || 'FASHIONPOINT',
                issuer: globalConfig?.adminIssuerWallet?.classicAddress || 'ADMIN',
                note: `Points refunded from order ${orderId}`
              }
            });
          }
        });

        return NextResponse.json({
          success: true,
          message: 'Order refunded successfully',
          refundedPoints: order.usePointAmt
        });
      }

      case 'batch': {
        const { orders } = params; // orders: Array<{productId: string, quantity: number}>

        if (!Array.isArray(orders) || orders.length === 0) {
          return NextResponse.json(
            { error: 'Orders array is required and must not be empty' },
            { status: 400 }
          );
        }

        const user = await prisma.account.findUnique({
          where: { id: userId },
          include: { wallet: true }
        });

        if (!user || !user.wallet) {
          return NextResponse.json(
            { error: 'User or wallet not found' },
            { status: 400 }
          );
        }

        // 모든 상품 정보 조회
        const productIds = orders.map(order => order.productId);
        const products = await prisma.product.findMany({
          where: { id: { in: productIds } },
          include: { company: { include: { wallet: true } } }
        });

        if (products.length !== productIds.length) {
          return NextResponse.json(
            { error: 'Some products not found' },
            { status: 400 }
          );
        }

        // 주문 생성 및 결제 정보 준비
        const createdOrders = [];
        const batchPayments: BatchPaymentItem[] = [];

        for (const orderReq of orders) {
          const product = products.find(p => p.id === orderReq.productId);
          if (!product) continue;

          const totalAmount = parseInt(product.priceDrops) * orderReq.quantity;

          const order = await prisma.order.create({
            data: {
              buyerId: userId,
              productId: orderReq.productId,
              quantity: orderReq.quantity,
              unitPriceDrops: product.priceDrops,
              totalDrops: totalAmount.toString(),
              usePointAmt: "0",
              status: 'CREATED'
            }
          });

          createdOrders.push(order);

          // 배치 결제 항목 추가
          batchPayments.push({
            destination: product.company.wallet!.classicAddress,
            amount: totalAmount.toString()
          });
        }

        try {
          // 배치 결제 실행
          const batchResult = await sendBatchXRP(user.wallet.seedCipher!, batchPayments);

          if (!batchResult.success) {
            // 결제 실패시 생성된 주문들 삭제
            await prisma.order.deleteMany({
              where: { id: { in: createdOrders.map(o => o.id) } }
            });
            return NextResponse.json(
              { error: 'Batch payment failed' },
              { status: 502 }
            );
          }

          // 모든 주문 상태를 PAID로 업데이트
          await prisma.$transaction(async (tx) => {
            for (let i = 0; i < createdOrders.length; i++) {
              const order = createdOrders[i];

              await tx.payment.create({
                data: {
                  orderId: order.id,
                  currency: 'XRP',
                  amountDrops: order.totalDrops,
                  payerAddr: user.wallet!.classicAddress,
                  payTxHash: batchResult.txHash,
                  status: 'PAID'
                }
              });

              await tx.order.update({
                where: { id: order.id },
                data: { status: 'PAID' }
              });

              await tx.orderEvent.create({
                data: {
                  orderId: order.id,
                  type: 'PAYMENT_RECEIVED',
                  note: `Batch payment received: ${order.totalDrops} drops`
                }
              });
            }
          });

          return NextResponse.json({
            success: true,
            message: 'Batch order created and payment processed successfully',
            orderIds: createdOrders.map(o => o.id),
            txHash: batchResult.txHash,
            totalOrders: createdOrders.length
          });

        } catch (error) {
          console.error('Batch order error:', error);
          // 결제 실패시 생성된 주문들 삭제
          await prisma.order.deleteMany({
            where: { id: { in: createdOrders.map(o => o.id) } }
          });
          return NextResponse.json(
            { error: 'Batch order processing failed' },
            { status: 500 }
          );
        }
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Order API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    const userId = searchParams.get('userId');

    if (orderId) {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          buyer: true,
          product: {
            include: {
              company: true
            }
          },
          timeline: {
            orderBy: { at: 'desc' }
          },
          payments: true,
          escrows: true
        }
      });

      if (!order) {
        return NextResponse.json(
          { error: 'Order not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(order);
    }

    if (userId) {
      const orders = await prisma.order.findMany({
        where: { buyerId: userId },
        include: {
          product: {
            include: {
              company: true
            }
          },
          escrows: true
        },
        orderBy: { createdAt: 'desc' }
      });

      return NextResponse.json(orders);
    }

    const orders = await prisma.order.findMany({
      include: {
        buyer: true,
        product: {
          include: {
            company: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    return NextResponse.json(orders);
  } catch (error) {
    console.error('Order GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}